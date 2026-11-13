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

    // 前进流动脉冲（2.5s 一圈，沿路线往前跑 3 组）——窄而克制，避免大团过曝光斑
    float pulse = fract(along / 30.0 - uTime / uFlowSpeed);
    pulse = smoothstep(0.0, 0.03, pulse) * smoothstep(0.10, 0.04, pulse);

    vec3 col;
    float a;
    if (uMode < 0.5) {
      // ===== 地面带 =====
      // 横向羽化：中心亮、两缘透明（平滑填充，无暗带）
      float feather = smoothstep(0.0, 0.34, vUv.y) * smoothstep(1.0, 0.66, vUv.y);

      // 细亮扫描线：接缝细（~8% 占空）→ 屏幕上 1~2px，只有提亮、没有暗间隙。
      // 越远越密：用 1/(1+d) 使线距随距离收窄（近处稀疏、远处密集）。
      float dens = mix(1.0, 2.6, clamp(along / 55.0, 0.0, 1.0));
      float lineCoord = along * dens + uTime * 0.12;
      float lineIdx = floor(lineCoord);
      float jitter = (hash(lineIdx) - 0.5) * 0.35;
      float ln = fract(lineCoord + jitter);
      // 细亮线：宽度 ~0.08，边缘柔和，平滑进填充里
      float thin = smoothstep(0.0, 0.045, ln) * smoothstep(0.085, 0.04, ln);
      float brightJ = 0.7 + 0.3 * hash(lineIdx + 3.7);
      float scan = thin * brightJ;

      // 平滑半透明填充：近处略暗（透出路面纹理），远处稍弱
      float fill = feather * mix(0.26, 0.07, clamp(vUv.x * 1.3, 0.0, 1.0));
      a = fill * distFade * nearFade * uOpacity;
      a += scan * feather * 0.09 * distFade * nearFade * uOpacity;   // 细亮线只比填充亮 ~25%
      // 脉冲在近处淡出（避免脚下大团光斑），远处才明显
      float pulseNear = smoothstep(2.5, 6.0, vDist);
      a += pulse * feather * 0.10 * distFade * nearFade * pulseNear * uOpacity;
      col = mix(uColor, uFarColor, pulse * 0.2 + vUv.x * 0.25);
      col *= 1.0 + scan * 0.18 + pulse * 0.12 * pulseNear;   // 最大亮度远低于白
    } else {
      // ===== 边缘光幕 =====
      // 竖直渐变：顶部 0.6 → 底部 0.05（转弯处明显立起，直行时不过分抢眼）
      float vertGrad = mix(0.05, 0.6, pow(vUv.y, 1.1));
      float dens = mix(1.0, 2.2, clamp(along / 55.0, 0.0, 1.0));
      float lineCoord = along * dens + uTime * 0.1;
      float lineIdx = floor(lineCoord);
      float ln = fract(lineCoord + (hash(lineIdx) - 0.5) * 0.3);
      float thin = smoothstep(0.0, 0.05, ln) * smoothstep(0.10, 0.045, ln);
      float brightJ = 0.7 + 0.3 * hash(lineIdx + 11.1);
      float scan = 1.0 + thin * brightJ * 0.25;   // 细亮线，25% 对比
      a = vertGrad * scan * distFade * nearFade * uOpacity;
      a += pulse * 0.3 * distFade * nearFade * uOpacity;
      // 顶沿更亮（形成细亮轨）
      a += smoothstep(0.86, 1.0, vUv.y) * 0.5 * distFade * nearFade * uOpacity;
      col = mix(uColor, uFarColor, smoothstep(0.5, 1.0, vUv.y) * 0.7 + pulse * 0.35);
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
