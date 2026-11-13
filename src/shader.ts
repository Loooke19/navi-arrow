/**
 * 材质（REDO5）：
 * - 地面带 Band：加法混合、浅青（#8EC5FF→#BFE3FF），横向羽化、沿路渐隐、细横向扫描线、前进流动脉冲
 * - 边缘光幕 Rail：加法混合、竖直 α 顶 0.5 → 底 0.05、扫描线、近处淡入
 * 全部 AdditiveBlending —— 只会让照片更亮，绝不压暗。
 */
import * as THREE from 'three'

const vert = /* glsl */ `
  uniform float uReveal;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vDist;

  void main() {
    vUv = uv;
    vec3 p = position;
    // 生长：沿路线由近到远展开
    float reveal = clamp(uReveal * 1.3 - vUv.x * 0.3, 0.0, 1.0);
    p.y *= reveal;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const frag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;        // 近处颜色（浅青）
  uniform vec3 uFarColor;     // 远处颜色（更白）
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uScanLines;
  uniform float uReveal;
  uniform float uMode;        // 0 = 地面带, 1 = 边缘光幕
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vDist;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    // 距离渐隐（~60m 完全淡出）
    float distFade = 1.0 - smoothstep(18.0, 60.0, vDist);
    // 近处 1~2m 柔和淡入（避免脚下硬块）
    float nearFade = smoothstep(0.3, 1.8, vDist);

    // 沿弧长的重复 UV（每 1m 一个循环），给扫描线与流动脉冲用
    float along = vUv.x * 90.0;

    // 前进流动脉冲（2.5s 一圈，沿路线往前跑 3 组）
    float pulse = fract(along / 30.0 - uTime / uFlowSpeed);
    pulse = smoothstep(0.0, 0.08, pulse) * smoothstep(0.26, 0.06, pulse);

    vec3 col;
    float a;
    if (uMode < 0.5) {
      // ===== 地面带 =====
      // 横向羽化：中心亮、两缘透明
      float feather = smoothstep(0.0, 0.34, vUv.y) * smoothstep(1.0, 0.66, vUv.y);
      // 细横向扫描线（沿路线方向排列，跨过带宽）
      float lineIdx = floor(along);
      float jitter = (hash(lineIdx) - 0.5) * 0.5;
      float brightJ = 0.55 + 0.45 * hash(lineIdx + 3.7);
      float scan = step(0.55, fract(along + jitter + uTime * 0.10)) * brightJ;
      float base = feather * mix(0.30, 0.06, vUv.x);
      a = base * distFade * nearFade * uOpacity;
      a += scan * feather * 0.16 * distFade * nearFade * uOpacity;
      a += pulse * feather * 0.35 * distFade * nearFade * uOpacity;
      col = mix(uColor, uFarColor, pulse * 0.6 + vUv.x * 0.3);
      col *= 1.0 + scan * 0.35 + pulse * 0.9;
    } else {
      // ===== 边缘光幕 =====
      float vertGrad = mix(0.05, 0.5, pow(vUv.y, 1.0));
      float lineIdx = floor(along);
      float brightJ = 0.6 + 0.4 * hash(lineIdx + 11.1);
      float scan = 0.7 + 0.3 * step(0.5, fract(along + uTime * 0.08)) * brightJ;
      a = vertGrad * scan * distFade * nearFade * uOpacity;
      a += pulse * 0.35 * distFade * nearFade * uOpacity;
      // 顶沿更亮（形成细亮轨）
      a += smoothstep(0.82, 1.0, vUv.y) * 0.45 * distFade * nearFade * uOpacity;
      col = mix(uColor, uFarColor, smoothstep(0.5, 1.0, vUv.y) * 0.7 + pulse * 0.4);
    }
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    if (gl_FragColor.a < 0.003) discard;
  }
`

export interface NaviUniforms {
  uColor: { value: THREE.Color }
  uFarColor: { value: THREE.Color }
  uOpacity: { value: number }
  uTime: { value: number }
  uFlowSpeed: { value: number }
  uScanLines: { value: number }
  uReveal: { value: number }
  uMode: { value: number }
}

export function createBandMaterial(opts: {
  color: string
  farColor: string
  opacity: number
  flowSpeed: number
  scanLines: number
}): THREE.ShaderMaterial {
  const uniforms: NaviUniforms = {
    uColor: { value: new THREE.Color(opts.color) },
    uFarColor: { value: new THREE.Color(opts.farColor) },
    uOpacity: { value: opts.opacity },
    uTime: { value: 0 },
    uFlowSpeed: { value: opts.flowSpeed },
    uScanLines: { value: opts.scanLines },
    uReveal: { value: 1 },
    uMode: { value: 0 },
  }
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: uniforms as any,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, // 只加光，绝不压暗
  })
}

export function createRailMaterial(opts: {
  color: string
  farColor: string
  opacity: number
  flowSpeed: number
}): THREE.ShaderMaterial {
  const m = createBandMaterial({ ...opts, scanLines: 12 })
  m.uniforms.uMode.value = 1
  return m
}

/** 兼容旧 API 名称 */
export const createCurtainMaterial = createBandMaterial
