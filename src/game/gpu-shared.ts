// 전투가 바뀔 때 GPU 자원(도형 버퍼 · 텍스처) 정리.
// 여러 부대가 함께 쓰는 자원(불러온 모델 · 구워 둔 병사 · 의상 텍스처 등)은 '공유'로 표시해 두고 남긴다.
// 그 밖에 부대마다 새로 만든 도형 · 텍스처(상태 막대 · 깃발 · 망토 · 장식 · 진영 고리 등)는 버린다.
import * as THREE from 'three'

const shared = new WeakSet<object>()

export function markShared(...items: Array<object | null | undefined>): void {
  for (const item of items) if (item) shared.add(item)
}

function texturesOf(material: THREE.Material): THREE.Texture[] {
  const out: THREE.Texture[] = []
  for (const value of Object.values(material)) if (value && (value as THREE.Texture).isTexture) out.push(value as THREE.Texture)
  return out
}

/** 모델 전체(도형 · 재질의 텍스처)를 공유로 표시 */
export function markTreeShared(root: THREE.Object3D): void {
  root.traverse(node => {
    const mesh = node as THREE.Mesh
    if (mesh.geometry) shared.add(mesh.geometry)
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
    for (const material of materials) for (const texture of texturesOf(material)) shared.add(texture)
  })
}

/** 장면에서 뺀 묶음의 자기 것(공유 아닌) 도형 · 텍스처를 GPU에서 내린다.
 *  재질 자체는 버리지 않는다(셰이더를 다음 전투에서 다시 컴파일하지 않게). */
export function disposeOwned(root: THREE.Object3D): void {
  const seen = new Set<object>()
  root.traverse(node => {
    const mesh = node as THREE.Mesh
    if ((node as THREE.InstancedMesh).isInstancedMesh) (node as THREE.InstancedMesh).dispose() // 인스턴스 행렬 버퍼
    // 뼈 애니메이션 모델: 뼈대마다 뼈 행렬 텍스처가 하나씩 있다(망토는 몸과 같은 뼈대를 쓴다)
    const skeleton = (node as THREE.SkinnedMesh).isSkinnedMesh ? (node as THREE.SkinnedMesh).skeleton : null
    if (skeleton && !shared.has(skeleton) && !seen.has(skeleton)) { seen.add(skeleton); skeleton.dispose() }
    // 스프라이트는 three가 모든 스프라이트에 같은 도형 하나를 쓴다
    const geometry = (node as THREE.Sprite).isSprite ? undefined : mesh.geometry as THREE.BufferGeometry | undefined
    if (geometry && !shared.has(geometry) && !seen.has(geometry)) { seen.add(geometry); geometry.dispose() }
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
    for (const material of materials) {
      for (const texture of texturesOf(material)) if (!shared.has(texture) && !seen.has(texture)) { seen.add(texture); texture.dispose() }
    }
  })
}
