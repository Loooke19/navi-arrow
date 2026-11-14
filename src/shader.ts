/**
 * 光幕材质（光片，不是实体）：
 * 全部 AdditiveBlending + depthWrite false。片元 rgb 是光的颜色，alpha 是光量，
 * 帧缓冲里累加 color*alpha（黑底）。最终合成把这份光加到照片上，alpha 置 0，
 * 所以只会提亮，绝不会压暗路面。
 *
 * uMode 0 地面带：中心约 0.16、向两侧余弦羽化到 0，沿程 1 → 0.3 → 0
 * uMode 1 侧光幕：贴地约 0.35 收到顶边约 0.05，顶上再加一条屏幕空间细亮线
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

  // 沿程：近 1.0 → 远 0.3 → 末端 0；脚下 2m 内柔和淡入
  float routeFade(float along, float dist) {
    float k = mix(1.0, 0.3, smoothstep(0.28, 0.78, along));
    k *= 1.0 - smoothstep(0.78, 1.0, along);
    // 脚下几米柔和淡入，底部不要切出一根亮边
    k *= smoothstep(1.0, 3.8, dist);
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
      float feather = 0.5 + 0.5 * cos(across * 3.14159265);
      float body = 0.17 * feather * fade * uOpacity;
      body += pulse * 0.040 * feather * fade * uOpacity;
      vec3 col = mix(nearCol, farCol, clamp(vUv.x * 0.55, 0.0, 1.0));
      added = col * body;
      a = body;
    } else {
      // ===== 侧光幕 =====
      // 贴地最亮 (~0.35) → 顶边几乎收尽 (~0.05)，然后再叠顶边细线
      float t = smoothstep(0.0, 1.0, vUv.y);
      float bodyI = mix(0.35, 0.05, t);

      // 很淡的竖向纤维（沿高度不变、沿路线疏密变化），像一层光纱
      float cells = mix(36.0, 80.0, clamp(uScanLines / 18.0, 0.0, 1.0));
      float su = vUv.x * cells;
      float id = floor(su);
      float f = fract(su);
      float n = hash(id);
      float w = mix(0.10, 0.34, n);
      float fiber = smoothstep(0.0, w * 0.5, f) * smoothstep(w, w * 0.45, f);
      bodyI *= mix(0.88, 1.0, fiber);

      // 顺着看（直行）只留一层很淡的纱，避免侧幕投影成粗边；
      // 正面看到（转弯）才是完整的 0.35 光片。
      float face = smoothstep(0.06, 0.48, vFace);
      float faceK = mix(0.16, 1.0, face);
      faceK = max(faceK, smoothstep(0.25, 0.85, vTurn));
      // 转弯处光幕正面展开，比直行时的淡边更亮、更立得住
      faceK *= mix(1.0, 1.45, smoothstep(0.35, 1.0, vTurn));
      bodyI *= faceK;
      bodyI *= fade * uOpacity;
      bodyI += pulse * 0.05 * (1.0 - t) * fade * uOpacity;

      // 顶边：屏幕空间 2~3px（近）收到更细（远），亮青白 + 软辉光
      float fw = max(fwidth(vUv.y), 1e-4);
      float px = (1.0 - vUv.y) / fw;
      float farT = smoothstep(4.0, 48.0, vDist);
      float corePx = mix(1.15, 0.38, farT);
      float core = exp(-0.5 * (px / corePx) * (px / corePx));
      float glowPx = corePx * 2.4;
      float glow = exp(-0.5 * (px / max(glowPx, 0.8)) * (px / max(glowPx, 0.8)));
      float lineI = (core * 0.55 + glow * 0.10) * fade * uOpacity;
      lineI *= 1.0 + pulse * 0.22;

      vec3 bodyCol = mix(nearCol, farCol, t * 0.35 + vUv.x * 0.25);
      vec3 lineCol = vec3(0.78, 0.91, 1.0);
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
  varying vec2 vUv;

  void main() {
    vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
    float ax = abs(p.x);
    // 开口朝后、尖端朝前的软 V。中心亮，边缘化进透明，没有描边。
    float ridge = mix(0.84, 0.18, smoothstep(0.0, 0.94, ax));
    float d = abs(p.y - ridge);
    float core = exp(-pow(d / 0.14, 2.0));
    float soft = exp(-pow(d / 0.30, 2.0));
    float arm = 1.0 - smoothstep(0.62, 1.02, ax);
    float m = clamp((core * 0.72 + soft * 0.38) * arm, 0.0, 1.0);
    float a = m * uOpacity * uFade;
    vec3 col = mix(vec3(0.62, 0.82, 1.0), uColor, clamp(core, 0.0, 1.0));
    if (a < 0.012) discard;
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

/** 贴地软 V。opacity 在 1 的设计强度下中心约为 0.6。 */
export function createChevronMaterial(color: string, opacity = 0.6): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uFade: { value: 1 },
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
