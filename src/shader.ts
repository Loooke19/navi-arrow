/**
 * [INPUT]: depends on THREE shader/material/blending primitives from three
 * [OUTPUT]: provides createVolumetricCurtainMaterial, createGroundAuraMaterial, createChevronMaterial, createCompositeShader, and legacy material aliases
 * [POS]: GLSL shader layer within src/, rendering the DJI-inspired volumetric U-curtain, feathered ground aura, and HDR-to-display composite pass
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import * as THREE from 'three'

export interface VolumetricUniforms {
  uColor: { value: THREE.Color }
  uHighlight: { value: THREE.Color }
  uOpacity: { value: number }
  uTime: { value: number }
  uFlowSpeed: { value: number }
  uScanLines: { value: number }
  uReveal: { value: number }
  uFloorGain: { value: number }
  uBgBright: { value: number }
}

const curtainVert = /* glsl */ `
  attribute float aHNorm;
  attribute float aArchY;
  attribute float aDist;
  attribute float aTurn;
  uniform float uReveal;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vCamDist;
  varying float vHNorm;
  varying float vArchY;
  varying float vDistM;
  varying float vTurn;

  void main() {
    vUv = uv;
    vHNorm = aHNorm;
    vArchY = aArchY;
    vDistM = aDist;
    vTurn = aTurn;

    vec3 p = position;
    // 出现时从近到远平滑生长展开（600ms ease-out）
    float reveal = clamp(uReveal * 1.30 - vUv.x * 0.30, 0.0, 1.0);
    p.y *= reveal;

    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - wp.xyz;
    vec4 mv = viewMatrix * wp;
    vCamDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const curtainFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uHighlight;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uScanLines;
  uniform float uReveal;
  uniform float uBgBright;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vCamDist;
  varying float vHNorm;
  varying float vArchY;
  varying float vDistM;
  varying float vTurn;

  void main() {
    float tAbs = vHNorm;
    if (tAbs >= 1.038 || uReveal <= 0.005) discard;

    // 快速绕行倒 U（∩）脉冲光环（从近端底部出发，沿倒 U 余弦拱罩快速向前扫过并在尽头消散）
    float cycle = max(uFlowSpeed, 0.4);
    float pulseCycle = max(cycle * 0.85, 0.8);
    float pulsePhase = fract(uTime / pulseCycle);
    float sweepT = clamp(pulsePhase / 0.78, 0.0, 1.0);
    float pulseU = mix(-0.04, 1.03, pow(sweepT, 1.35));
    float dPulse = (vUv.x + 0.016 * tAbs * tAbs) - pulseU;
    float pulseShape = (dPulse >= 0.0)
      ? exp(-pow(dPulse / 0.022, 2.0))
      : exp(-pow(dPulse / 0.055, 2.0));
    float pulseWindow = smoothstep(0.0, 0.06, pulsePhase) * (1.0 - smoothstep(0.66, 0.78, pulsePhase));
    float pulseEndFade = 1.0 - smoothstep(0.84, 1.0, vUv.x);
    float pulseGlow = pulseShape * pulseWindow * pulseEndFade;

    // 中心 28% 走廊在非脉冲位置保持 0% 完全透明；脉冲经过时合拢为完整倒 U 拱形光环
    if (tAbs <= 0.28 && pulseGlow <= 0.004) discard;

    // 1. 柔和宽幅渐升核心（0.28 -> 1.0 平滑爬升，压抑两侧过亮堆积）
    float gradT = clamp((tAbs - 0.28) / 0.72, 0.0, 1.0);
    float figmaRamp = pow(gradT, 1.25);

    // 2. 纯解析连续体积增益（不依赖多边形顶点法线，彻底消除纯黑背景下的纵向折痕）
    float volumeBoost = 0.68 + 0.22 * gradT + 0.14 * vTurn;

    // 3. 大疆同款锐利抗锯齿外边界（1.5px 干净收齐，外侧零模糊雾）
    float fw = max(fwidth(tAbs), 0.004);
    float edgeAA = 1.0 - smoothstep(1.0 - fw * 1.1, 1.0 + fw * 0.7, tAbs);

    // 4. 顺滑沿程呼吸流光（去掉正弦纵向条纹，保证两侧光幕细腻均匀）
    float wave = 0.5 + 0.5 * sin(vDistM * 0.32 - (uTime / cycle) * 6.2831853);
    float flow = 1.0 + 0.08 * pow(wave, 2.0);

    // 5. 纵深空气衰减
    float distFade = mix(1.0, 0.52, smoothstep(6.0, 54.0, vCamDist))
                   * mix(1.0, 0.78, smoothstep(0.80, 1.0, vUv.x));
    float revealFade = smoothstep(0.0, 0.25, clamp(uReveal * 1.30 - vUv.x * 0.30, 0.0, 1.0));

    float baseEnergy = figmaRamp * volumeBoost * edgeAA * flow * distFade * revealFade * uOpacity;
    float pulseEnergy = pulseGlow * (0.85 + 0.75 * figmaRamp) * edgeAA * revealFade * uOpacity * 1.35;
    float totalEnergy = baseEnergy + pulseEnergy;
    if (totalEnergy < 0.0025) discard;

    // 色彩层次：沿立体弧面从主蓝柔和过渡到清透亮青，脉冲光环处叠加冰青高光
    float hiMix = clamp(gradT * 0.52 + vTurn * 0.18, 0.0, 0.78);
    vec3 baseCol = mix(uColor, uHighlight, hiMix);
    vec3 pulseCol = mix(uHighlight, vec3(0.84, 0.97, 1.0), 0.52);

    vec3 rgb = baseCol * (baseEnergy * 0.72) + pulseCol * pulseEnergy;
    float baseDensity = figmaRamp * (0.48 + 0.18 * gradT) * edgeAA * distFade * revealFade * uOpacity;
    float pulseDensity = pulseGlow * (0.48 + 0.32 * figmaRamp) * edgeAA * revealFade * uOpacity;
    float density = clamp(baseDensity + pulseDensity, 0.0, 0.92);
    gl_FragColor = vec4(rgb, density);
  }
`

const groundVert = /* glsl */ `
  attribute float aLat;
  attribute float aDist;
  uniform float uReveal;
  varying vec2 vUv;
  varying float vLat;
  varying float vDistM;
  varying float vCamDist;

  void main() {
    vUv = uv;
    vLat = aLat;
    vDistM = aDist;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vCamDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const groundFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uHighlight;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uScanLines;
  uniform float uReveal;
  uniform float uFloorGain;
  uniform float uBgBright;

  varying vec2 vUv;
  varying float vLat;
  varying float vDistM;
  varying float vCamDist;

  void main() {
    // 中心区域按 Figma 渐变保持 0% 全透明，不额外叠底色遮盖渐变
    discard;
  }
`

const chevronFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uHighlight;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uWidth;
  uniform float uLength;
  uniform float uPlaneW;
  uniform float uPlaneL;
  varying vec2 vUv;

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  float sdChevron(vec2 p, vec2 apex, float halfSpanX, float dropY) {
    vec2 wingL = vec2(-halfSpanX, apex.y - dropY);
    vec2 wingR = vec2(halfSpanX, apex.y - dropY);
    return min(sdSegment(p, apex, wingL), sdSegment(p, apex, wingR));
  }

  void main() {
    float across = (vUv.x - 0.5) * uPlaneW;
    float forward = (0.5 - vUv.y) * uPlaneL;
    vec2 p = vec2(across, forward);

    // 百度 AR 风格双层圆角厚箭头：粗胶囊双臂 + 纯白描边 + 亮天蓝渐变填充 + 柔蓝底晕
    float W = uWidth;
    float R = W * 0.175;
    float halfSpanX = W * 0.32;
    float dropY = halfSpanX * 0.72;
    float strokeW = R * 0.20;

    float yFront = R * 1.25;
    float yRear = yFront - R * 2.45;

    float dFront = sdChevron(p, vec2(0.0, yFront), halfSpanX, dropY);
    float dRear = sdChevron(p, vec2(0.0, yRear), halfSpanX, dropY);

    float aa = max(max(fwidth(dFront), fwidth(dRear)), 0.0045 * W);

    // 外轮廓柔蓝底晕（先铺在最底层）
    float dMin = min(dFront, dRear);
    float dropGlow = exp(-0.5 * pow(max(0.0, dMin - R * 0.88) / (R * 0.68), 2.0)) * 0.24;

    // 柔化协调的双层圆角半透明流光箭头：保持双层圆角形态，柔化白边并统一到光幕亮蓝渐变色系
    vec3 outPremul = mix(uColor, uHighlight, 0.35) * dropGlow;
    float outAlpha = dropGlow;

    for (int k = 0; k < 2; k++) {
      float d = (k == 0) ? dRear : dFront;
      float outer = 1.0 - smoothstep(R - aa * 1.35, R + aa * 1.35, d);
      if (outer < 0.002) continue;
      float inner = 1.0 - smoothstep(R - strokeW - aa * 1.25, R - strokeW + aa * 1.25, d);
      float border = max(0.0, outer - inner);

      // 与光幕同色系半透明渐变：后层偏主亮蓝、前层偏冰青亮蓝
      float grad = clamp(0.5 + (p.x / max(W, 1e-4)) * 0.50 + ((p.y - ((k == 0) ? yRear : yFront)) / max(R * 2.5, 1e-4)) * 0.45, 0.0, 1.0);
      vec3 rearCol = mix(uColor * 0.92, mix(uColor, uHighlight, 0.45), grad);
      vec3 frontCol = mix(mix(uColor, uHighlight, 0.28), uHighlight, grad);
      vec3 fillCol = (k == 0) ? rearCol : frontCol;

      float fillA = (k == 0) ? 0.44 : 0.52;
      float borderA = (k == 0) ? 0.56 : 0.66;
      vec3 borderCol = mix(uHighlight, vec3(0.94, 0.98, 1.0), 0.55);

      vec3 layerPremul = fillCol * (inner * fillA) + borderCol * (border * borderA);
      float layerA = clamp(inner * fillA + border * borderA, 0.0, 0.72);

      outPremul = layerPremul + outPremul * (1.0 - layerA);
      outAlpha = layerA + outAlpha * (1.0 - layerA);
    }

    float fade = clamp(uFade * min(1.0, uOpacity), 0.0, 1.0);
    outPremul *= fade;
    outAlpha = clamp(outAlpha * fade, 0.0, 0.76);
    if (outAlpha < 0.006) discard;
    gl_FragColor = vec4(outPremul, outAlpha);
  }
`

function createTransmissiveAdditiveMaterial(
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, { value: any }>,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    // RGB 线性累加体积光能量，Alpha 按光学透射率 1 - (1 - a1)(1 - a2) 合成
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  })
}

function makeVolumetricUniforms(opts: {
  color: string
  highlight: string
  opacity: number
  flowSpeed: number
  scanLines: number
}): VolumetricUniforms {
  return {
    uColor: { value: new THREE.Color(opts.color) },
    uHighlight: { value: new THREE.Color(opts.highlight) },
    uOpacity: { value: opts.opacity },
    uTime: { value: 0 },
    uFlowSpeed: { value: opts.flowSpeed },
    uScanLines: { value: opts.scanLines },
    uReveal: { value: 1 },
    uFloorGain: { value: 1 },
    uBgBright: { value: 0 },
  }
}

/** 竖直 U 型立体光幕材质 */
export function createVolumetricCurtainMaterial(opts: {
  color: string
  highlight: string
  opacity: number
  flowSpeed: number
  scanLines: number
}): THREE.ShaderMaterial {
  const uniforms = makeVolumetricUniforms(opts)
  return createTransmissiveAdditiveMaterial(curtainVert, curtainFrag, uniforms as any)
}

/** 贴地柔光衬底 + 外侧高斯羽化材质 */
export function createGroundAuraMaterial(opts: {
  color: string
  highlight: string
  opacity: number
  flowSpeed: number
  scanLines: number
}): THREE.ShaderMaterial {
  const uniforms = makeVolumetricUniforms(opts)
  return createTransmissiveAdditiveMaterial(groundVert, groundFrag, uniforms as any)
}

/**
 * 最终 HDR 体积光合成着色器：
 * - 暗/常规背景（uBgBright → 0）：采用柔和指数色调映射 1 - exp(-L) 叠加发光，绝不压暗路面，且完整保留双层光幕叠透高光；
 * - 亮白背景（uBgBright → 1，如医院抛光白地砖/强光实景）：平滑过渡为清透天青滤光混合，外圈 Bloom 光晕同样柔和可见。
 */
export function createCompositeShader(primaryColor: string, highlightColor: string) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uBgBright: { value: 0 },
      uTintPrimary: { value: new THREE.Color(primaryColor) },
      uTintHighlight: { value: new THREE.Color(highlightColor) },
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
      uniform sampler2D tDiffuse;
      uniform float uBgBright;
      uniform vec3 uTintPrimary;
      uniform vec3 uTintHighlight;
      varying vec2 vUv;

      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 hdr = max(c.rgb, vec3(0.0));
        float energy = max(hdr.r, max(hdr.g, hdr.b));
        float softGate = smoothstep(0.0, 0.006, energy);
        hdr *= softGate;

        // 1. 常规/暗色路面：软肩色调映射，高能叠透处自然泛起清透冰青亮泽，适度保留蓝色浓度不被高光冲白
        vec3 darkLight = vec3(1.0) - exp(-hdr * 1.15);
        float peakT = smoothstep(0.65, 1.75, energy) * 0.26;
        darkLight = mix(darkLight, mix(uTintHighlight, vec3(0.86, 0.97, 1.0), 0.35) * min(1.0, energy * 0.80), peakT);
        float darkAlpha = clamp(c.a * 0.72, 0.0, 0.88) * softGate;

        // 2. 高亮白色地面（如医院白瓷砖）：透明度严格随 c.a 线性平滑过渡，不人为抬高外缘不透明度导致"像断开一样"
        float minC = min(hdr.r, min(hdr.g, hdr.b));
        float sat = clamp((energy - minC) / max(energy, 1e-4), 0.0, 1.0);
        float brightAlpha = clamp(c.a * 0.95, 0.0, 0.86) * softGate;
        float hiRatio = smoothstep(0.24, 0.98, energy);
        vec3 themeTint = mix(uTintPrimary, uTintHighlight, hiRatio * 0.58);
        vec3 normHdr = clamp(hdr / max(energy, 1e-4), 0.0, 1.0);
        vec3 graphicTint = mix(vec3(0.97, 0.99, 1.0), normHdr, smoothstep(0.08, 0.42, sat));
        vec3 brightTint = mix(themeTint, graphicTint, smoothstep(0.42, 0.80, c.a));
        vec3 brightPremul = brightTint * brightAlpha;

        vec3 outRgb = mix(darkLight, brightPremul, clamp(uBgBright, 0.0, 1.0));
        float outAlpha = mix(darkAlpha, brightAlpha, clamp(uBgBright, 0.0, 1.0));
        gl_FragColor = vec4(outRgb, outAlpha);
      }
    `,
  }
}

/** 贴地双层圆角 V 引导箭头材质（premultiplied NormalBlending，白边与蓝填充不被底部光带冲白） */
export function createChevronMaterial(
  color: string,
  opacity = 0.85,
  size?: { width: number; length: number; planeW: number; planeL: number },
  highlight = '#8AD4FF',
): THREE.ShaderMaterial {
  const s = size ?? { width: 0.6, length: 0.23, planeW: 0.9, planeL: 0.9 }
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: chevronFrag,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHighlight: { value: new THREE.Color(highlight) },
      uOpacity: { value: opacity },
      uFade: { value: 1 },
      uWidth: { value: s.width },
      uLength: { value: s.length },
      uPlaneW: { value: s.planeW },
      uPlaneL: { value: s.planeL },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  })
}

/** 兼容旧版导出名称 */
export function createBandMaterial(opts: {
  color: string
  farColor: string
  opacity: number
  flowSpeed: number
  scanLines: number
}): THREE.ShaderMaterial {
  return createGroundAuraMaterial({
    color: opts.color,
    highlight: opts.farColor,
    opacity: opts.opacity,
    flowSpeed: opts.flowSpeed,
    scanLines: opts.scanLines,
  })
}

export function createRailMaterial(opts: {
  color: string
  farColor: string
  opacity: number
  flowSpeed: number
}): THREE.ShaderMaterial {
  return createVolumetricCurtainMaterial({
    color: opts.color,
    highlight: opts.farColor,
    opacity: opts.opacity,
    flowSpeed: opts.flowSpeed,
    scanLines: 14,
  })
}

export const createCurtainMaterial = createVolumetricCurtainMaterial
