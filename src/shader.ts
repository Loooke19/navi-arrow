/**
 * 光幕 ShaderMaterial（重做版）：
 * 竖直光帘——顶部最亮往下渐透明、细横向扫描线、菲涅尔边缘光、距离渐隐、流动光、uReveal 生长。
 * AdditiveBlending / transparent / depthWrite:false / DoubleSide。
 */
import * as THREE from 'three'

const vert = /* glsl */ `
  uniform float uReveal;      // 生长动画 0~1
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vDist;

  void main() {
    vUv = uv;
    vec3 p = position;
    // 生长：近处先显现，光帘高度从 0 长到 1（ease-out 由 JS 写入 uReveal）
    float reveal = clamp(uReveal * 1.25 - vUv.x * 0.25, 0.0, 1.0);
    p.y *= reveal;

    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * wp;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const frag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uTopColor;
  uniform float uOpacity;      // 总体强度
  uniform float uTime;
  uniform float uFlowSpeed;    // 流动光周期（秒）
  uniform float uScanLines;    // 扫描线数量
  uniform float uReveal;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vDist;

  void main() {
    // 距离渐隐（fog 式）
    float distFade = 1.0 - smoothstep(18.0, 70.0, vDist);

    // 竖直渐变：顶部最亮 α≈0.7 → 底部 α≈0.15；底部 15% 内快速衰减避免"地垫"感
    float vertGrad = mix(0.15, 0.7, pow(vUv.y, 1.15));
    vertGrad *= smoothstep(0.0, 0.18, vUv.y);

    // 细横向扫描线（固定在线网上，轻微滚动）
    float scan = 0.78 + 0.22 * step(0.5, fract(vUv.y * uScanLines - uTime * 0.15));

    // 菲涅尔边缘光：视线与面越平行越亮
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndv = abs(dot(normalize(vWorldNormal), viewDir));
    float fres = pow(1.0 - ndv, 2.0);

    // 流动光：亮带沿 uv.x 往前循环（2.5s 一圈）
    float flow = fract(vUv.x - uTime / uFlowSpeed);
    float band = smoothstep(0.0, 0.1, flow) * smoothstep(0.3, 0.12, flow);
    // 生长中不发流动光
    band *= step(0.999, uReveal);

    float a = vertGrad * scan * distFade * uOpacity;
    a += fres * 0.28 * distFade * uOpacity * smoothstep(0.0, 0.15, vUv.y);
    a += band * 0.35 * distFade * uOpacity;
    // 顶沿加重（衔接 TubeGeometry 亮线）
    a += smoothstep(0.92, 1.0, vUv.y) * 0.25 * distFade * uOpacity;

    vec3 col = mix(uColor, uTopColor, smoothstep(0.6, 1.0, vUv.y) * 0.7 + band * 0.3);
    gl_FragColor = vec4(col * (1.0 + band * 0.8 + fres * 0.4), clamp(a, 0.0, 1.0));
    if (gl_FragColor.a < 0.004) discard;
  }
`

export interface CurtainUniforms {
  uColor: { value: THREE.Color }
  uTopColor: { value: THREE.Color }
  uOpacity: { value: number }
  uTime: { value: number }
  uFlowSpeed: { value: number }
  uScanLines: { value: number }
  uReveal: { value: number }
}

export function createCurtainMaterial(opts: {
  color: string
  topColor: string
  opacity: number
  flowSpeed: number
  scanLines: number
}): THREE.ShaderMaterial {
  const uniforms: CurtainUniforms = {
    uColor: { value: new THREE.Color(opts.color) },
    uTopColor: { value: new THREE.Color(opts.topColor) },
    uOpacity: { value: opts.opacity },
    uTime: { value: 0 },
    uFlowSpeed: { value: opts.flowSpeed },
    uScanLines: { value: opts.scanLines },
    uReveal: { value: 1 },
  }
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: uniforms as any,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
}
