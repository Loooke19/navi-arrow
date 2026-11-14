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
  attribute float aTurn;
  uniform float uReveal;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vDist;
  varying float vFace;
  varying float vTurn;

  void main() {
    vUv = uv;
    vTurn = aTurn;
    vec3 p = position;
    float reveal = clamp(uReveal * 1.3 - vUv.x * 0.3, 0.0, 1.0);
    // 近处把光幕压矮，避免贴着镜头的侧幕在屏幕上摊成一根粗管；
    // 走到转弯（十几米外）才升到完整高度。
    vec4 wp0 = modelMatrix * vec4(position, 1.0);
    float dist0 = length(cameraPosition - wp0.xyz);
    float rise = smoothstep(3.5, 14.0, dist0);
    p.y *= reveal * mix(0.2, 1.0, rise);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vFace = abs(dot(n, normalize(cameraPosition - wp.xyz)));
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
  uniform float uScanLines;
  uniform float uReveal;
  uniform float uMode;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vDist;
  varying float vFace;
  varying float vTurn;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  // 沿程：转弯那一段仍保持接近 1，只有最远端收到 0
  float routeFade(float along, float dist) {
    float k = mix(1.0, 0.35, smoothstep(0.62, 0.9, along));
    k *= 1.0 - smoothstep(0.9, 1.0, along);
    k *= smoothstep(0.9, 3.2, dist);
    return k;
  }

  void main() {
    float fade = routeFade(vUv.x, vDist);
    float speed = max(uFlowSpeed, 0.25);
    // 沿路线向前的柔光脉冲（只加亮，没有暗带）
    float pulse = fract(vUv.x * 3.0 - uTime / speed);
    pulse = smoothstep(0.0, 0.10, pulse) * smoothstep(0.32, 0.10, pulse);
    pulse *= smoothstep(3.0, 6.5, vDist);

    vec3 nearCol = uColor;
    vec3 farCol = uFarColor;
    vec3 added;
    float a;

    if (uMode < 0.5) {
      // ===== 地面光带：均匀浅填充，两侧软落到 0，没有硬边 =====
      float across = abs(vUv.y - 0.5) * 2.0;
      float feather = pow(max(0.5 + 0.5 * cos(across * 3.14159265), 0.0), 0.72);
      float body = 0.34 * feather * fade * uOpacity;
      // 近端大约再亮 30%，远处回到设计强度
      body *= mix(1.30, 1.0, smoothstep(5.5, 13.0, vDist));
      body += pulse * 0.06 * feather * fade * uOpacity;
      vec3 col = mix(nearCol, farCol, clamp(vUv.x * 0.4, 0.0, 1.0));
      added = col * body;
      a = body;
    } else {
      // ===== 侧光幕 =====
      // 贴地约 0.45 → 顶边约 0.07，转弯处这就是正面看见的光片
      float t = smoothstep(0.0, 1.0, vUv.y);
      float bodyI = mix(0.45, 0.07, t);

      // 很淡的竖向纤维（沿高度不变、沿路线疏密变化），像一层光纱
      float cells = mix(36.0, 80.0, clamp(uScanLines / 18.0, 0.0, 1.0));
      float su = vUv.x * cells;
      float id = floor(su);
      float f = fract(su);
      float n = hash(id);
      float w = mix(0.10, 0.34, n);
      float fiber = smoothstep(0.0, w * 0.5, f) * smoothstep(w, w * 0.45, f);
      bodyI *= mix(0.88, 1.0, fiber);

      // 顺着看只留一窄条，避免贴镜头摊成粗管；转弯（vTurn）用完整 0.45
      float face = smoothstep(0.04, 0.4, vFace);
      float faceK = mix(0.22, 1.0, face);
      faceK = max(faceK, smoothstep(0.12, 0.55, vTurn));
      bodyI *= faceK;
      bodyI *= fade * uOpacity;
      bodyI += pulse * 0.05 * (1.0 - t) * fade * uOpacity;

      // 顶边：屏幕空间 2~3px（近）收到更细（远），亮青白 + 软辉光
      float fw = max(fwidth(vUv.y), 1e-4);
      float px = (1.0 - vUv.y) / fw;
      float farT = smoothstep(4.0, 48.0, vDist);
      float corePx = mix(1.25, 0.42, farT);
      float core = exp(-0.5 * (px / corePx) * (px / corePx));
      float glowPx = corePx * 2.2;
      float glow = exp(-0.5 * (px / max(glowPx, 0.8)) * (px / max(glowPx, 0.8)));
      float lineI = (core * 0.82 + glow * 0.16) * fade * uOpacity;
      lineI *= 1.0 + pulse * 0.18;

      vec3 bodyCol = mix(nearCol, farCol, t * 0.25 + vUv.x * 0.2);
      // 顶边是浅青蓝，不往白色靠
      vec3 lineCol = mix(nearCol, vec3(0.45, 0.82, 1.0), 0.72);
      added = bodyCol * bodyI + lineCol * lineI;
      a = bodyI + lineI;
    }

    if (a < 0.004) discard;
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
