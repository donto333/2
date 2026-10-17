// 무장마다의 차림새: 초상화(generals-realistic-webp)를 보고 정한 옷 · 갑옷 · 금속 · 장식 · 말 색과 장식.
// 기본 말 탄 모델(cavalry · tianming · zhugeliang)의 텍스처를 셰이더에서 그 자리에서 다시 칠한다(파일을 늘리지 않는다).
//  · 붉은 천 · 청록 천(채도 높은 곳) → 옷 색   · 어두운 쇠 · 가죽 → 갑옷 색   · 밝은 쇠 · 흰 비단 → 금속 색
//  · 머리 쪽의 채도 높은 천(투구 술 · 깃) → 장식 색   · 말 뼈대에 붙은 밤색 털 → 말 색   · 얼굴 살빛은 그대로
// 전용 의상(skins/*.jpg)이나 전용 모델이 있는 무장(관우 · 조운 · 여포 · 조조 · 제갈량 · 사마의 · 주유 · 하후돈)은 쓰지 않는다.
import * as THREE from 'three'

export type DressOrnament = 'beard' | 'whiteBeard' | 'shortBeard' | 'headband' | 'hairBun'

export interface HeroDress {
  cloth: number
  armor: number
  metal: number
  accent: number
  horse: number
  ornaments?: DressOrnament[]
  /** 망토 색(없으면 망토 없음) */
  cape?: number
  /** 책사 모델(흰 도포): 밝은 천도 옷 색으로 */
  robe?: boolean
  /** 여성 무장: 투구를 머리 모양으로 오므려 머리카락 색으로 칠한다 */
  female?: boolean
  /** 머리카락 색(여성 무장) */
  hair?: number
}

// 말 털 색
const BAY = 0x6b3a1e, CHESTNUT = 0x8a4520, BLACK = 0x1e1a18, WHITE = 0xd6d2c8, DUN = 0x9a7a50, DARK = 0x3a2a20, GREY = 0x8a8a84
// 황건 장수: 노란 전포 · 두건
const YELLOW = { cloth: 0xb8901e, armor: 0x3a3026, metal: 0x8a7040, accent: 0xc9a020 }

const d = (cloth: number, armor: number, metal: number, accent: number, horse: number, extra: Partial<HeroDress> = {}): HeroDress => ({ cloth, armor, metal, accent, horse, ...extra })

export const HERO_DRESS: Record<string, HeroDress> = {
  'cai-wenji': d(0x2c4a7a, 0x2a2a30, 0xc9b88a, 0xc9a050, WHITE, { female: true, hair: 0x14100e, ornaments: ['hairBun'] }),
  'cao-hong': d(0x6b4a2e, 0x4a3e30, 0x8a8478, 0x6b4a2e, BAY),
  'cao-ren': d(0x1f3a6e, 0x3a4048, 0xa8b0b8, 0x1f3a6e, DARK, { cape: 0x1f3a6e }),
  'chen-gong': d(0x4a3826, 0x3a3028, 0x9a7a4a, 0x4a3826, BAY),
  'cheng-yu': d(0x2e2c2a, 0x2a2a2a, 0x8a8a8a, 0x5a5650, GREY, { ornaments: ['whiteBeard'] }),
  'da-qiao': d(0x2e6a3e, 0x7a2a1e, 0xc9a050, 0x8a1e18, WHITE, { cape: 0x2e6a3e, female: true, hair: 0x14100e, ornaments: ['hairBun'] }),
  'dian-wei': d(0x2a2420, 0x262626, 0x6a6a6a, 0x5a1a14, BLACK),
  'diao-chan': d(0x9a1e1e, 0x5a1a14, 0xd8c8a0, 0xd8c8a0, WHITE, { female: true, hair: 0x120e0e, ornaments: ['hairBun'] }),
  'dong-zhuo': d(0x4a2a1a, 0x3a2a20, 0x8a6a40, 0x6a3a1e, BLACK),
  'fa-zheng': d(0x2a4a34, 0x2e3a30, 0x9a8a5a, 0x2a4a34, BAY),
  'gan-ning': d(0x1e2e4a, 0x2a3040, 0x7a8a9a, 0x1e2e4a, DARK),
  'gao-shun': d(0x2a3040, 0x30343a, 0x7a8088, 0x3a3a3a, BAY),
  'gongsun-zan': d(0xd8d8d8, 0x8a8e94, 0xe4e8ec, 0xb02020, WHITE),
  'guan-hai': d(YELLOW.cloth, YELLOW.armor, YELLOW.metal, YELLOW.accent, BAY, { ornaments: ['headband'] }),
  'guan-ping': d(0x2a4a2a, 0x2e342a, 0x8a9a8a, 0x2a4a2a, BAY),
  'guan-xing': d(0x2e6a3a, 0x3a4a3a, 0xb8c0b0, 0xc9a050, WHITE, { cape: 0x2e6a3a }),
  'guo-jia': d(0x1e1e22, 0x1e1e22, 0x6a6a6a, 0x3a3a3a, DARK),
  'han-sui': d(0x4a3e30, 0x3a3530, 0x7a7468, 0x5a4a38, BAY),
  'huang-gai': d(0x5a2e1e, 0x4a2e20, 0x8a6a48, 0x6a2a1a, BAY),
  'huang-zhong': d(0x6a5030, 0x5a4428, 0xc0a060, 0x8a6a30, DUN, { ornaments: ['whiteBeard'] }),
  'jia-xu': d(0x26262a, 0x222226, 0x5a5a5a, 0x3a3a3a, BLACK),
  'li-dian': d(0x5a5e62, 0x4a4e52, 0xb0b6bc, 0x3a3e42, BAY),
  'ling-tong': d(0x2a4048, 0x2e3a40, 0xa0aab0, 0x2a4048, DARK),
  'liu-bei': d(0x2a5a2e, 0x4a4a2a, 0xc9a850, 0x8a1e18, WHITE, { cape: 0x7a1a14 }),
  'lu-meng': d(0x1e3a6e, 0x3a4250, 0xc8ced6, 0x1e3a6e, DARK, { cape: 0x1e3a6e }),
  'lu-su': d(0x2a6a5a, 0x2a3a34, 0x9a8a5a, 0x2a6a5a, DUN),
  'lu-xun': d(0x8a1e18, 0x6a1e18, 0xc9a050, 0x8a1e18, BAY),
  'ma-chao': d(0x2a4a7a, 0x8a9098, 0xdde2e8, 0xe8e8e8, WHITE),
  'ma-dai': d(0x6a5034, 0x4a3a28, 0x8a7a5a, 0x6a5034, 0x5a3018),
  'ma-teng': d(0x4a3a2a, 0x3a3028, 0x8a7a60, 0x5a4a38, 0x2a1e18),
  'meng-huo': d(0x7a3a1e, 0x5a3a24, 0xa08040, 0x2a8a6a, BAY),
  'pang-de': d(0xd0ccc4, 0x8a8a86, 0xd8d8d4, 0xc0bcb4, WHITE),
  'pang-tong': d(0x3a3028, 0x2e2822, 0x6a5a48, 0x3a3028, BAY),
  'song-xian': d(0x5a4a3a, 0x4a4038, 0x8a8478, 0x5a4a3a, BAY),
  'sun-ce': d(0xa01e18, 0x8a2a1e, 0xc9a050, 0xb02018, DARK, { cape: 0x9a1e18 }),
  'sun-jian': d(0x6a1e18, 0x5a2e20, 0xa08060, 0x8a1e18, BAY),
  'sun-quan': d(0x2a4a8a, 0x4a5060, 0xc9a050, 0x2a4a8a, WHITE),
  'taishi-ci': d(0x1e2a4a, 0x262e3e, 0x6a7a8a, 0x1e2a4a, DARK, { cape: 0x1e2a4a }),
  'wang-ping': d(0x2a5a3a, 0x4a5048, 0xa8b0a8, 0x2a5a3a, BAY),
  'wei-yan': d(0x2a4a2a, 0x3a3e30, 0x9a8a50, 0x2a4a2a, DARK, { cape: 0x24402a }),
  'wen-chou': d(0x5a1a18, 0x2e2a28, 0x7a7068, 0x8a1e18, BLACK, { cape: 0x5a1a18 }),
  'wen-ping': d(0x2a5a4a, 0x3a4a44, 0xa0b0a8, 0x2a5a4a, BAY),
  'xu-chu': d(0x5a3a28, 0x4a3428, 0x8a7050, 0x6a2a1a, BAY),
  'xu-huang': d(0x2e4a32, 0x4a4234, 0x9a8a60, 0x2e4a32, BAY, { cape: 0x2e4a32 }),
  'xu-shu': d(0x2a4a34, 0x2a3a30, 0x8a8a6a, 0x2a4a34, DUN),
  'xun-you': d(0x3a3028, 0x2e2a26, 0x7a6a50, 0x3a3028, BAY),
  'xun-yu': d(0x2a4a2a, 0x2a3a2a, 0xb0a060, 0x2a4a2a, WHITE),
  'yan-liang': d(0x6a1e18, 0x5a2a22, 0x9a7a60, 0x8a1e18, DARK, { cape: 0x5a1a18 }),
  'yu-jin': d(0x26304a, 0x2e3440, 0x7a8494, 0x26304a, BLACK),
  'yuan-shao': d(0x4a2a6a, 0x6a5a30, 0xd0b060, 0x5a2a7a, WHITE, { cape: 0x4a2a6a }),
  'yuan-shu': d(0xb08a30, 0x8a6a28, 0xd8b860, 0xc09a30, WHITE),
  'yue-jin': d(0x6a1e1e, 0x4a2a24, 0x8a7a68, 0x6a1e1e, BAY),
  'zhang-bao': d(0x2a4a44, 0x2e3a38, 0x8a9a96, 0x2a4a44, BAY),
  'zhang-bo': d(YELLOW.cloth, YELLOW.armor, YELLOW.metal, YELLOW.accent, BAY, { ornaments: ['headband'] }),
  'zhang-fei': d(0x1e3a34, 0x22262a, 0x5a6a6a, 0x1e3a34, BLACK),
  'zhang-he': d(0x1e1e22, 0x3a3428, 0xc9a050, 0x1e1e22, BAY, { cape: 0x1e1e22 }),
  'zhang-jiao': d(0xc0961e, 0x4a3a20, 0x9a8040, 0xc9a020, DUN, { ornaments: ['headband', 'beard'] }),
  'zhang-liang': d(YELLOW.cloth, YELLOW.armor, YELLOW.metal, YELLOW.accent, BAY, { ornaments: ['headband'] }),
  'zhang-liao': d(0x6a1e1e, 0x4a4a4a, 0xb8bec4, 0x7a1a14, DARK, { cape: 0x6a1e1e }),
  'zhang-lu': d(0x6a5a2a, 0x3a3420, 0x9a8a50, 0x6a5a2a, DUN),
  'zhou-cang': d(YELLOW.cloth, 0x2e2a26, 0x7a6a50, YELLOW.accent, BLACK, { ornaments: ['headband'] }),
  'zhu-rong': d(0x8a2a14, 0x6a3a1e, 0xc9a050, 0xd06a1e, CHESTNUT, { female: true, hair: 0x1a120e, ornaments: ['hairBun'] }),
}

/** 이 무장의 차림새(없으면 기본 모델 그대로) */
export function heroDress(id: string): HeroDress | undefined {
  return HERO_DRESS[id]
}

/** 머리 뼈(얼굴 · 투구) 번호: 모델마다 같은 뼈대 배치(말 0~30, 사람 31~) */
function headBones(mesh: THREE.SkinnedMesh): THREE.Vector3 {
  const bones = mesh.skeleton?.bones ?? []
  const at = (name: string) => bones.findIndex(b => b.name === name)
  return new THREE.Vector3(at('Neck'), at('Head'), at('HeadTop_End'))
}

/** 뼈의 기본 자세 위치(뼈대 기본 자세 공간 — 셰이더의 bindMatrix * position과 같은 공간) */
function bindPosition(mesh: THREE.SkinnedMesh, name: string): THREE.Vector3 {
  const i = mesh.skeleton?.bones.findIndex(b => b.name === name) ?? -1
  if (i < 0) return new THREE.Vector3(0, -99, 0)
  return new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert())
}

/**
 * 초상화 얼굴을 비출 자리(머리뼈 기준, 모델 실측): x = 그림 가운데 높이, y = 비출 정사각형 한 변, z = 이보다 앞쪽만.
 * 얼굴 그림(assets/faces/*.webp)은 초상화의 눈 · 입 위치(얼굴 인식)로 맞춰, 눈 가운데가 (0.5, 위에서 0.38) ·
 * 입 가운데가 (0.5, 위에서 0.62)에 오도록 돌리고 잘라 두었다 → 모델의 눈 · 입 높이에 맞춘다.
 */
export const FACE_RECT = new THREE.Vector4(0.102, 0.281, 0.02, 0)
/** 모델마다 얼굴 자리(x = 그림 가운데 높이, y = 한 변, z = 이보다 앞쪽만, w = 옆으로 비낀 정도) · 머리뼈 가중치로 거를지 */
const FACE_RECTS: Record<string, { rect: THREE.Vector4; gate: boolean }> = {
  cavalry: { rect: FACE_RECT, gate: true },
  tianming: { rect: FACE_RECT, gate: true },
  lubu: { rect: new THREE.Vector4(0.102, 0.281, -0.15, 0), gate: false },
  zhugeliang: { rect: new THREE.Vector4(0.126, 0.378, -0.05, 0), gate: false },
  caocao: { rect: new THREE.Vector4(0.176, 0.382, -0.05, 0.05), gate: false },
}

type DressUniforms = { [key: string]: { value: unknown } }

/** 셰이더에 차림새 재채색 · 초상화 얼굴을 끼워 넣는다(다른 onBeforeCompile에서도 함께 부를 수 있게 따로 둔다) */
export function patchDressShader(shader: { vertexShader: string; fragmentShader: string; uniforms: DressUniforms }, uniforms: DressUniforms): void {
  Object.assign(shader.uniforms, uniforms)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vDressHorse; varying float vDressHead; varying vec3 vDressPos; varying vec3 vDressNrm; uniform vec3 uDressHead, uFaceHeadPos; uniform float uFemale;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_SKINNING
        vDressHorse = dot(skinWeight, vec4(lessThan(skinIndex, vec4(30.5))));
        vec4 hh = vec4(lessThan(abs(skinIndex - uDressHead.y), vec4(.5))) + vec4(lessThan(abs(skinIndex - uDressHead.z), vec4(.5)));
        vec4 hd = hh + vec4(lessThan(abs(skinIndex - uDressHead.x), vec4(.5)));
        vDressHead = dot(skinWeight, min(hd, vec4(1.)));
        // 뼈대의 기본 자세 공간(여러 메시가 한 재질을 나눠 써도 같은 좌표)
        vDressPos = (bindMatrix * vec4(transformed, 1.)).xyz; vDressNrm = mat3(bindMatrix) * objectNormal;
        if (uFemale > .5) {
          // 여성 무장: 이마 위 투구(챙 · 둥근 몸통 · 꼭지)를 두개골 모양 타원체로 오므린다 → 틀어 올린 머리 모양
          float hw = vDressHead;
          vec3 rel = vDressPos - uFaceHeadPos;
          vec3 C = vec3(0., .14, -.02), R = vec3(.115, .15, .14);
          vec3 dd = (rel - C) / R; float len = length(dd);
          float k = hw * smoothstep(.12, .16, rel.y) * step(1., len);
          rel = mix(rel, C + (rel - C) / len * 1.015, k);
          vDressPos = rel + uFaceHeadPos;
          transformed = (bindMatrixInverse * vec4(vDressPos, 1.)).xyz;
        }
      #else
        vDressPos = position; vDressNrm = objectNormal;
        vDressHorse = 0.; vDressHead = 0.;
      #endif`)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying float vDressHorse; varying float vDressHead; varying vec3 vDressPos; varying vec3 vDressNrm;
      uniform vec3 uDressCloth, uDressArmor, uDressMetal, uDressAccent, uDressHorseColor, uFaceHeadPos; uniform vec4 uFaceRect; uniform float uDressOn, uDressRobe, uFaceOn, uFaceGate; uniform vec3 uFaceSkin, uHairColor; uniform float uFemale; uniform sampler2D uFaceMap;
      vec3 dressHsv(vec3 c){ vec4 K = vec4(0., -1. / 3., 2. / 3., -1.); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); return vec3(abs(q.z + (q.w - q.y) / (6. * d + 1e-10)), d / (q.x + 1e-10), q.x); }
      // 원래 결(명암)은 살리고, 밝기는 그 부위의 평균 밝기(ref) 대비로 원하는 색을 따른다(검은 말은 검게, 은빛 갑옷은 밝게)
      vec3 dressTint(vec3 target, float lum, float ref){ return clamp(target * (lum / ref), 0., 1.); }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      float dressHair = 0., dressFace = 0.;
      if (uDressOn > .5) {
        vec3 dc = diffuseColor.rgb, hsv = dressHsv(pow(max(dc, 0.), vec3(1. / 2.2)));
        float lum = dot(dc, vec3(.2126, .7152, .0722));
        float horse = step(.5, vDressHorse), head = step(.35, vDressHead), rider = 1. - horse;
        float hueRed = 1. - smoothstep(.035, .07, min(hsv.x, 1. - hsv.x));
        float hueTeal = smoothstep(.40, .44, hsv.x) * (1. - smoothstep(.54, .58, hsv.x));
        // 얼굴 살빛(주황 기 · 중간 채도 · 밝음)은 건드리지 않는다
        float skin = smoothstep(.02, .04, hsv.x) * (1. - smoothstep(.1, .13, hsv.x)) * step(.45, hsv.z) * (1. - step(.62, hsv.y));
        // 머리 쪽(얼굴)은 아주 진한 천(투구 술 · 깃)만 칠한다 — 입술 · 눈가 살빛이 물들지 않게
        float cloth = rider * max(hueRed, hueTeal) * smoothstep(.32, .45, hsv.y) * step(.1, hsv.z) * (1. - skin) * (1. - head * (1. - step(.74, hsv.y) * (1. - step(.6, hsv.z))));
        float accent = cloth * head * step(.55, hsv.y);
        float dark = rider * (1. - smoothstep(.22, .38, hsv.y)) * (1. - smoothstep(.26, .4, hsv.z));
        float light = rider * (1. - smoothstep(.12, .22, hsv.y)) * smoothstep(.42, .56, hsv.z);
        // 말 털: 붉은 밤색 ~ 누런 갈색(색상 0 ~ .13, 붉은 쪽 끝 포함)
        float coatHue = hsv.x > .9 ? 0. : hsv.x;
        float coat = horse * (1. - smoothstep(.1, .13, coatHue)) * smoothstep(.28, .42, hsv.y) * step(.12, hsv.z);
        float pale = horse * (1. - smoothstep(.12, .2, hsv.y)) * smoothstep(.45, .6, hsv.z);
        dc = mix(dc, dressTint(uDressArmor, lum, .03), dark * .8);
        dc = mix(dc, dressTint(mix(uDressMetal, uDressCloth, uDressRobe), lum, mix(.32, .5, uDressRobe)), light * mix(.75, .9, uDressRobe));
        dc = mix(dc, dressTint(uDressCloth, lum, .07), cloth * (1. - accent));
        dc = mix(dc, dressTint(uDressAccent, lum, .07), accent);
        dc = mix(dc, dressTint(uDressHorseColor, lum, .09), coat);
        dc = mix(dc, dressTint(uDressHorseColor, lum, .6), pale);
        diffuseColor.rgb = dc;
      }
      if (uFaceOn > .5 && vDressHorse < .5) {
        // 목 · 귀 · 손의 살빛도 초상화 얼굴빛을 따른다(얼굴 그림 가장자리와 이어지게)
        vec3 sc = diffuseColor.rgb, sh = dressHsv(pow(max(sc, 0.), vec3(1. / 2.2)));
        float skinM = smoothstep(.0, .03, sh.x) * (1. - smoothstep(.1, .14, sh.x)) * smoothstep(.15, .3, sh.y) * (1. - smoothstep(.6, .7, sh.y)) * smoothstep(.35, .5, sh.z);
        float sl = dot(sc, vec3(.2126, .7152, .0722));
        diffuseColor.rgb = mix(sc, clamp(uFaceSkin * (sl / .42), 0., 1.), skinM * .85);
        // 여성 무장: 머리(투구 자리)와 목가리개는 머리카락 — 살빛이 아닌 머리 쪽 전부
        if (uFemale > .5) { float hy = vDressPos.y - uFaceHeadPos.y; dressHair = smoothstep(.1, .35, vDressHead) * smoothstep(-.14, -.08, hy) * (1. - skinM * (1. - smoothstep(.15, .17, hy))); }
      }
      if (uFaceOn > .5 && (uFaceGate < .5 || vDressHead > .05)) {
        // 초상화 얼굴: 머리뼈 앞쪽 얼굴면에 정면으로 비춘다(타원 가장자리는 부드럽게 원래 얼굴과 섞는다)
        vec3 rel = vDressPos - uFaceHeadPos;
        vec2 fuv = vec2((rel.x - uFaceRect.w) / uFaceRect.y + .5, (rel.y - uFaceRect.x) / uFaceRect.y + .5);
        float front = smoothstep(-.25, .3, abs(normalize(vDressNrm).z)) * smoothstep(uFaceRect.z, uFaceRect.z + .03, rel.z);
        vec2 q = (fuv - vec2(.5, .49)) / vec2(.245, .33);
        float m = front * mix(1., smoothstep(.05, .3, vDressHead), uFaceGate) * (1. - smoothstep(.72, 1., length(q)));
        vec4 fc = texture2D(uFaceMap, clamp(fuv, 0., 1.));
        dressFace = m * .95 * fc.a;
        diffuseColor.rgb = mix(diffuseColor.rgb, fc.rgb * 1.1, dressFace);
      }
      if (dressHair > 0.) {
        float hl = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
        dressHair *= 1. - dressFace;
        diffuseColor.rgb = mix(diffuseColor.rgb, uHairColor * (.85 + .3 * clamp(hl / .3, 0., 1.)), dressHair);
      }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .5, dressHair);`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0., dressHair);`)
}

const EMPTY_FACE = new THREE.DataTexture(new Uint8Array([200, 160, 140, 255]), 1, 1)
EMPTY_FACE.needsUpdate = true

/** 차림새 · 얼굴 유니폼(재질마다). 차림새가 없으면 재채색은 끄고 얼굴만 쓴다 */
export function dressUniforms(dress: HeroDress | undefined, mesh: THREE.SkinnedMesh | null): DressUniforms {
  return {
    uDressOn: { value: dress ? 1 : 0 },
    uDressRobe: { value: dress?.robe ? 1 : 0 },
    uDressCloth: { value: new THREE.Color(dress?.cloth ?? 0) },
    uDressArmor: { value: new THREE.Color(dress?.armor ?? 0) },
    uDressMetal: { value: new THREE.Color(dress?.metal ?? 0) },
    uDressAccent: { value: new THREE.Color(dress?.accent ?? 0) },
    uDressHorseColor: { value: new THREE.Color(dress?.horse ?? 0) },
    uDressHead: { value: mesh ? headBones(mesh) : new THREE.Vector3(-9, -9, -9) },
    uFaceOn: { value: 0 },
    uFaceMap: { value: EMPTY_FACE },
    uFaceHeadPos: { value: mesh ? bindPosition(mesh, 'Head') : new THREE.Vector3(0, -99, 0) },
    uFaceRect: { value: FACE_RECT.clone() },
    uFaceGate: { value: 1 },
    uFemale: { value: dress?.female ? 1 : 0 },
    uHairColor: { value: new THREE.Color(dress?.hair ?? 0x14100e) },
    uFaceSkin: { value: new THREE.Color(0.55, 0.36, 0.27) },
  }
}

/** 초상화 얼굴 그림을 켠다 */
export function setFaceTexture(uniforms: DressUniforms, texture: THREE.Texture, model = 'cavalry'): void {
  const fit = FACE_RECTS[model] ?? FACE_RECTS.cavalry
  ;(uniforms.uFaceRect.value as THREE.Vector4).copy(fit.rect)
  uniforms.uFaceGate.value = fit.gate ? 1 : 0
  uniforms.uFaceMap.value = texture
  uniforms.uFaceOn.value = 1
  ;(uniforms.uFaceSkin.value as THREE.Color).copy(faceSkin(texture))
}

/** 얼굴 그림의 볼 · 코 둘레 평균 살빛(선형) — 그림마다 한 번만 잰다 */
function faceSkin(texture: THREE.Texture): THREE.Color {
  const cached = texture.userData.faceSkin as THREE.Color | undefined
  if (cached) return cached
  const color = new THREE.Color(0.55, 0.36, 0.27)
  const image = texture.image as CanvasImageSource & { width: number; height: number } | undefined
  try {
    if (image && image.width) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0, 32, 32)
      // 눈 아래 ~ 입 위, 양 볼(콧대 · 수염은 덜 들어가게 좌우 띠)
      let r = 0, g = 0, b = 0, n = 0
      for (const [x0, x1] of [[9, 13], [19, 23]]) {
        const data = ctx.getImageData(x0, 14, x1 - x0, 5).data
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++ }
      }
      color.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace)
    }
  } catch { /* 그림을 못 읽으면 기본 살빛 */ }
  texture.userData.faceSkin = color
  return color
}

/** 재질 하나에 차림새 · 얼굴 셰이더를 입힌다(한 번만; 이미 다른 셰이더 수정이 있으면 이어서). 유니폼을 돌려준다 */
export function applyDress(material: THREE.MeshStandardMaterial, dress: HeroDress | undefined, mesh: THREE.SkinnedMesh | null): DressUniforms {
  const existing = material.userData.dressUniforms as DressUniforms | undefined
  if (existing) return existing
  const uniforms = dressUniforms(dress, mesh)
  material.userData.dressUniforms = uniforms
  const previous = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey?.() ?? ''
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    patchDressShader(shader, uniforms)
  }
  material.customProgramCacheKey = () => `${previousKey}|dress`
  material.needsUpdate = true
  return uniforms
}

/** 무장의 초상화 얼굴 그림 */
const faces = new Map<string, Promise<THREE.Texture>>()
export function loadFace(url: string): Promise<THREE.Texture> {
  const cached = faces.get(url)
  if (cached) return cached
  const pending = new THREE.TextureLoader().loadAsync(url).then(texture => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture })
  pending.catch(() => faces.delete(url))
  faces.set(url, pending)
  return pending
}
