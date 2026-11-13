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
    // 距离渐隐（fog 式，~80m 处完全消失）
    float distFade = 1.0 - smoothstep(25.0, 80.0, vDist);

    // 竖直渐变：顶部 α≈0.45 → 底部 α≈0.05（街道照片能透出来）；底部快速衰减避免"地垫"感
    float vertGrad = mix(0.05, 0.45, pow(vUv.y, 1.1));
    vertGrad *= smoothstep(0.0, 0.15, vUv.y);

    // 细横向扫描线（8~14 条覆盖光帘高度，高对比清晰可见）
    float scan = 0.62 + 0.38 * step(0.5, fract(vUv.y * uScanLines - uTime * 0.12));

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
    a += fres * 0.16 * distFade * uOpacity * smoothstep(0.0, 0.15, vUv.y);
    a += band * 0.3 * distFade * uOpacity;
    // 顶沿衔接 TubeGeometry 亮线
    a += smoothstep(0.93, 1.0, vUv.y) * 0.2 * distFade * uOpacity;

    vec3 col = mix(uColor, uTopColor, smoothstep(0.6, 1.0, vUv.y) * 0.6 + band * 0.3);
    gl_FragColor = vec4(col * (1.0 + band * 0.5 + fres * 0.3), clamp(a, 0.0, 1.0));
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
