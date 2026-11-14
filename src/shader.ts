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
  attribute float aWall;
  uniform float uReveal;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDist;
  varying float vRim;
  varying float vWall;

  void main() {
    vUv = uv;
    vRim = aRim;
    vWall = aWall;
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
  uniform float uFloorGain;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDist;
  varying float vRim;
  varying float vWall;

  void main() {
    // 沿程只在贴着镜头时淡入，远端仍保持可见。横向另算，不在这里拉平。
    float fade = mix(1.0, 0.78, smoothstep(0.72, 1.0, vUv.x));
    fade *= smoothstep(0.35, 1.8, vDist);
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 1.45);
    // 横向 u：0 在中线，1 在两侧。中心几乎全透，两边平滑变实。
    float lat = abs(vUv.y * 2.0 - 1.0);
    float edge = pow(clamp(lat, 0.0, 1.0), 1.9);
    float topA = mix(0.04, 0.7, edge);
    // 侧面和近端切面法线接近水平，整面按边缘的亮度来，比顶面中心亮
    float sideK = 1.0 - smoothstep(0.22, 0.78, abs(N.y));
    float sideA = mix(0.58, 0.72, edge);
    float body = mix(topA, sideA, sideK);
    body *= fade * uOpacity * mix(1.0, uFloorGain, edge);
    body *= (0.92 + 0.08 * fres);
    vec3 col = mix(uColor, uFarColor, clamp(vUv.x * 0.35, 0.0, 1.0));

    float fw = max(fwidth(vRim), 1e-4);
    float px = (1.0 - vRim) / fw;
    float farT = smoothstep(4.0, 40.0, vDist);
    float corePx = mix(0.85, 0.4, farT);
    float line = exp(-0.5 * (px / corePx) * (px / corePx));
    line *= smoothstep(0.62, 0.98, vRim);
    float lineI = line * 0.36 * fade * uOpacity;
    vec3 lineCol = vec3(0.40, 0.94, 1.0);

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
    // 臂稍加粗，边缘收紧，远看仍是一个清楚的 V，不是一团光
    float rad = mix(uWidth * 0.07, uWidth * 0.16, smoothstep(0.0, 0.3, t));
    float core = 1.0 - smoothstep(rad * 0.55, rad * 1.02, d);
    float soft = 1.0 - smoothstep(rad * 0.9, rad * 1.28, d);
    float m = max(core, soft * 0.28);
    m *= 1.0 - smoothstep(0.86, 1.0, t);
    float cover = m * uFade;
    if (cover < 0.02) discard;
    vec3 col = mix(uColor, vec3(0.55, 0.98, 1.0), clamp(core, 0.0, 1.0));
    // rgb 继续加法；alpha 让白地板上红通道降下来，V 才不会被裁成纯白
    gl_FragColor = vec4(col * cover * uOpacity, cover * 0.5);
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
  uFloorGain: { value: number }
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
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    toneMapped: false,
  })
}

/** 极淡的青色衬底。只写入少量 alpha，让亮地板上也看得出青色，不压暗。 */
export function createFloorTintMaterial(color = '#40D8FF', amount = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uAmount: { value: amount },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAmount;
      varying vec2 vUv;
      void main() {
        if (uAmount < 0.001) discard;
        // 衬底也跟着横向变：中心不超过整段的约三分之一，避免把中间染实
        float lat = abs(vUv.y * 2.0 - 1.0);
        float edge = pow(clamp(lat, 0.0, 1.0), 1.9);
        float amt = uAmount * mix(0.28, 1.0, edge);
        gl_FragColor = vec4(uColor * amt, amt);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
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
    uFloorGain: { value: 1 },
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
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
}

/**
 * 转弯处立着的半透明标牌：对着镜头，中间一个指向转弯方向的 V。
 * rgb 加法，alpha 只压在箭头和淡幕上，亮背景上也能看出青色。
 */
export function createTurnSignMaterial(color = '#00C8FF'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uDir: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uDir;
      varying vec2 vUv;

      float segDist(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a;
        float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        return length(p - a - ab * t);
      }

      void main() {
        vec2 p = vUv - 0.5;
        p.x *= uDir;
        float panel = smoothstep(0.52, 0.30, length(p * vec2(1.05, 1.15)));
        vec2 tip = vec2(0.20, 0.0);
        vec2 wingU = vec2(-0.18, 0.30);
        vec2 wingD = vec2(-0.18, -0.30);
        float d = min(segDist(p, tip, wingU), segDist(p, tip, wingD));
        float arrow = 1.0 - smoothstep(0.07, 0.125, d);
        float ink = max(panel * 0.22, arrow * 0.62) * uOpacity;
        float glow = (panel * 0.28 + arrow * 1.15) * uOpacity;
        if (ink < 0.015) discard;
        vec3 col = mix(uColor, vec3(0.62, 0.98, 1.0), clamp(arrow, 0.0, 1.0));
        gl_FragColor = vec4(col * glow, ink);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    toneMapped: false,
  })
}

/** 兼容旧 API 名称 */
export const createCurtainMaterial = createBandMaterial
