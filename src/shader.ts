/**
 * 光幕材质（光片，不是实体）：
 * 全部 AdditiveBlending + depthWrite false。片元 rgb 是光的颜色，alpha 是光量，
 * 帧缓冲里累加 color*alpha（黑底）。最终合成把这份光加到照片上，alpha 置 0，
 * 所以只会提亮，绝不会压暗路面。
 *
 * uMode 0 地面带：青蓝 #3AA0FF→#66C8FF，中心约 0.34，两侧羽化，沿程 1 → 0.35 → 0
 * uMode 1 侧光幕：转弯处贴地约 0.45 收到顶边，顶上一条青蓝细线（不是白线）
 */
import * as THREE from 'three'

const vert = /* glsl */ `
  attribute float aRim;
  uniform float uReveal;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDist;
  varying float vRim;

  void main() {
    vUv = uv;
    vRim = aRim;
    vec3 p = position;
    float reveal = clamp(uReveal * 1.25 - vUv.x * 0.25, 0.0, 1.0);
    p.y *= reveal;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * wp;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const frag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uFarColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFlowSpeed;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDist;
  varying float vRim;

  void main() {
    float fade = mix(1.0, 0.62, smoothstep(0.5, 0.9, vUv.x));
    fade *= smoothstep(0.45, 2.2, vDist);
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 1.7);
    float body = 0.18 * (0.58 + 0.75 * fres) * fade * uOpacity;
    vec3 col = mix(uColor, uFarColor, clamp(vUv.x * 0.4 + fres * 0.06, 0.0, 1.0));

    float fw = max(fwidth(vRim), 1e-4);
    float px = (1.0 - vRim) / fw;
    float farT = smoothstep(3.0, 26.0, vDist);
    float corePx = mix(1.7, 0.75, farT);
    float line = exp(-0.5 * (px / corePx) * (px / corePx));
    line *= smoothstep(0.4, 0.9, vRim);
    float lineI = line * 0.78 * fade * uOpacity;
    vec3 lineCol = mix(uColor, vec3(0.42, 0.80, 1.0), 0.62);

    float a = body + lineI;
    if (a < 0.004) discard;
    vec3 added = col * body + lineCol * lineI;
    gl_FragColor = vec4(added / max(a, 1e-4), clamp(a, 0.0, 1.0));
  }
`

const chevronFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uWidth;
  uniform float uLength;
  uniform float uPlaneW;
  uniform float uPlaneL;
  varying vec2 vUv;

  float segT(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    return clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  }
  float segDist(vec2 p, vec2 a, vec2 b) {
    float t = segT(p, a, b);
    vec2 ab = b - a;
    return length(p - a - ab * t);
  }

  void main() {
    // +forward（uv.y 小的一端）朝 lookAt 的前方，也就是消失点
    float across = (vUv.x - 0.5) * uPlaneW;
    float forward = (0.5 - vUv.y) * uPlaneL;
    vec2 p = vec2(across, forward);
    vec2 tip = vec2(0.0, uLength * 0.5);
    vec2 wingR = vec2(uWidth * 0.5, -uLength * 0.5);
    vec2 wingL = vec2(-uWidth * 0.5, -uLength * 0.5);
    float dR = segDist(p, tip, wingR);
    float dL = segDist(p, tip, wingL);
    float t = dR < dL ? segT(p, tip, wingR) : segT(p, tip, wingL);
    float d = min(dR, dL);
    // 臂宽约为箭头宽度的 0.25；尖端收细，开口保持利落的 V
    float rad = mix(uWidth * 0.045, uWidth * 0.125, smoothstep(0.0, 0.28, t));
    float core = 1.0 - smoothstep(rad * 0.42, rad * 0.95, d);
    float soft = 1.0 - smoothstep(rad * 0.7, rad * 1.55, d);
    float m = max(core, soft * 0.62);
    // 翼端稍微化开，避免切成一根硬棒
    m *= 1.0 - smoothstep(0.82, 1.0, t);
    float a = m * uOpacity * uFade;
    vec3 col = mix(uColor, vec3(0.75, 0.91, 1.0), clamp(core, 0.0, 1.0));
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
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

function baseMaterial(uniforms: NaviUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: uniforms as any,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
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
  return baseMaterial(uniforms)
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

/** 贴地 V，尖端朝前。opacity 约 1 时中心清楚可读，边缘仍然软。 */
export function createChevronMaterial(color: string, opacity = 1.05, size?: { width: number; length: number; planeW: number; planeL: number }): THREE.ShaderMaterial {
  const s = size ?? { width: 0.6, length: 0.23, planeW: 0.9, planeL: 0.55 }
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uFade: { value: 1 },
      uWidth: { value: s.width },
      uLength: { value: s.length },
      uPlaneW: { value: s.planeW },
      uPlaneL: { value: s.planeL },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: chevronFrag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
}

/** 兼容旧 API 名称 */
export const createCurtainMaterial = createBandMaterial
