/**
 * 光幕 ShaderMaterial：网纹/扫描线、边缘光（菲涅尔近似）、流动亮带、远处渐隐、生长动画
 */
import * as THREE from 'three'
import type { NaviTheme } from './config'

const vert = /* glsl */ `
  uniform float uGrow;      // 生长动画 0~1
  attribute vec3 aBottomPosition;
  varying float vU;         // 归一化里程 0(近/起点)~1(远)
  varying float vV;         // 0(底)~1(顶)
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vDist;

  void main() {
    vU = uv.x;
    vV = uv.y;
    vec3 p = position;
    // 生长：沿里程方向从近到远展开
    float gate = step(vU, uGrow);
    p = mix(aBottomPosition, p, gate);
    // 生长期间高度也压低，形成"展开"感
    p.y *= mix(0.15, 1.0, clamp(uGrow * 1.6 - vU * 0.6, 0.0, 1.0));

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
  uniform vec3 uPrimary;
  uniform vec3 uHighlight;
  uniform float uNearOpacity;
  uniform float uFarOpacity;
  uniform float uTime;
  uniform float uFlowSpeed;
  varying float vU;
  varying float vV;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vDist;

  void main() {
    // 远近渐隐（相机距离 + 里程双重作用）
    float distFade = 1.0 - clamp(vDist / 90.0, 0.0, 1.0);
    distFade = pow(distFade, 1.4);
    float routeFade = 1.0 - smoothstep(0.55, 1.0, vU);
    float fade = distFade * routeFade;

    // 基础半透明填充：底部稍淡、顶部沿顶边更亮
    float alpha = mix(uNearOpacity, uFarOpacity, vU) * fade;

    // 细横向网纹/扫描线（轻微滚动）
    float lines = 0.5 + 0.5 * sin((vWorldPos.y * 22.0) - uTime * 0.8);
    lines = mix(0.82, 1.0, lines);
    alpha *= lines;

    // 边缘光（菲涅尔近似）：视线与面越平行越亮
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fres = 1.0 - abs(dot(viewDir, vWorldNormal));
    fres = pow(fres, 2.6);
    alpha += fres * 0.10 * fade;

    // 沿前进方向循环流动亮带（2~3 秒一循环）
    float flow = fract(vU * 3.0 - uTime / uFlowSpeed);
    float band = smoothstep(0.0, 0.12, flow) * smoothstep(0.36, 0.14, flow);
    alpha += band * 0.16 * fade;

    // 顶边更亮更实的描边高光
    float topEdge = smoothstep(0.88, 0.985, vV);
    vec3 col = mix(uPrimary, uHighlight, topEdge * 0.85 + fres * 0.3 + band * 0.25);
    // 顶边处 alpha 拉高成"亮细线"
    alpha = mix(alpha, min(1.0, alpha * 2.4 + 0.35), topEdge * fade);

    gl_FragColor = vec4(col, alpha);
    if (gl_FragColor.a < 0.003) discard;
  }
`

export function createCurtainMaterial(theme: NaviTheme, flowSpeed: number): THREE.ShaderMaterial {
  const primary = new THREE.Color(theme.primary)
  const highlight = new THREE.Color(theme.highlight).lerp(new THREE.Color('#ffffff'), 0.35)
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uPrimary: { value: primary },
      uHighlight: { value: highlight },
      uNearOpacity: { value: theme.nearOpacity },
      uFarOpacity: { value: theme.farOpacity },
      uTime: { value: 0 },
      uFlowSpeed: { value: flowSpeed },
      uGrow: { value: 1 },
    },
  })
}
