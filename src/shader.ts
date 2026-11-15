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
  uniform float uBright;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDist;
  varying float vRim;
  varying float vWall;

  void main() {
    // 沿程只在贴着镜头时淡入，远端仍保持可见。
    // 近端不淡出：路线会延伸到镜头身后，被画面底边自然裁掉，不留空隙。
    float fade = mix(1.0, 0.82, smoothstep(0.72, 1.0, vUv.x));
    vec3 N = normalize(vNormal);
    // 一直爬到边缘，不在外侧 20% 走平。0.97 处到顶，最外一圈不再另起一根刺。
    float lat = abs(vUv.y * 2.0 - 1.0);
    float rise = pow(smoothstep(0.10, 0.97, lat), 1.2);
    float sideK = 1.0 - smoothstep(0.30, 0.84, abs(N.y));
    float fw = max(fwidth(vRim), 1e-4);
    float px = (1.0 - vRim) / fw;
    float farT = smoothstep(4.0, 40.0, vDist);
    float corePx = mix(0.42, 0.22, farT);
    float line = exp(-0.5 * (px / corePx) * (px / corePx));
    line *= smoothstep(0.9, 0.995, vRim) * (1.0 - sideK);

    if (uBright > 0.5) {
      // 白地板：正常透明混合。饱和青 #00B4E6，中心约 0.11，边缘约 0.58。
      // 外缘若是一条被裁平的等亮平台，从左取峰落在外沿、从右取峰落在内沿。
      // 把平台向内收一点，两侧峰值才落在同一侧。坡面主体不动。
      float riseEdge = pow(smoothstep(0.10, 1.0, lat), 1.15);
      vec3 cyan = vec3(0.0, 0.706, 0.902);
      float alpha = mix(0.11, 0.58, riseEdge);
      alpha = mix(alpha, 0.62, sideK);
      alpha += line * 0.05;
      float fwLat = max(fwidth(lat), 1e-4);
      float edgePx = clamp((1.0 - lat) / fwLat, 0.0, 4.0);
      float rimCrest = mix(0.68, 1.0, exp(-1.6 * edgePx * edgePx));
      float fwY = max(fwidth(vWorldPos.y), 1e-4);
      float yPx = clamp(vWorldPos.y / fwY, 0.0, 4.0);
      float sideCrest = mix(0.55, 1.0, exp(-1.35 * yPx * yPx));
      float crest = mix(rimCrest, sideCrest, smoothstep(0.20, 0.80, sideK));
      float edgeZone = max(smoothstep(0.82, 0.97, lat), smoothstep(0.25, 0.85, sideK));
      alpha *= mix(1.0, crest, edgeZone);
      alpha = min(alpha, 0.66) * fade * uOpacity;
      if (alpha < 0.02) discard;
      gl_FragColor = vec4(cyan * alpha, alpha);
    } else {
      float shape = 0.20 + 0.42 * rise;
      float cover = mix(shape, 0.68, sideK) * fade * uOpacity;
      vec3 col = mix(uColor, uFarColor, clamp(vUv.x * 0.22, 0.0, 1.0));
      float lineI = line * 0.02 * fade * uOpacity;
      vec3 lineCol = vec3(0.55, 0.88, 0.98);
      float lightK = 0.50;
      vec3 added = col * cover * lightK + lineCol * lineI;
      float peak = max(added.r, max(added.g, added.b));
      if (peak > 0.32) added *= 0.32 / peak;
      float ink = (0.015 + 0.05 * rise) * fade * (1.0 - 0.45 * sideK);
      if (cover + lineI < 0.015) discard;
      gl_FragColor = vec4(added, ink);
    }
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
  uBright: { value: number }
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
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
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
        float rise = pow(smoothstep(0.10, 0.97, lat), 1.2);
        float shape = mix(0.11, 0.58, rise);
        float amt = uAmount * shape;
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
    uBright: { value: 0 },
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
