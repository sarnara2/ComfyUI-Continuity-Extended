export const CAST_PRESET_CATEGORIES = {
  identity: "Identity & role",
  use: "Usage & preservation",
  position: "Position & distance",
  marks: "Color marks",
  actions: "Reference actions",
  scene: "Scene & objects",
  camera: "Camera & composition",
  tempo: "Motion & timing",
  audio: "Audio & sound",
  editing: "Editing & exclusions",
  custom: "Custom",
};

function entry(id, field, category, label, ko, ja, zh, text, keywords, extra = {}) {
  return { id: `builtin:${id}`, field, category, label, ko, ja, zh,
    text: text.replace(/\.$/, ""), keywords, ...extra };
}

const descriptions = [
  ["main-character", "Main character", "주요 인물", "主要人物", "主要人物", "A main character.", "주인공 주요 인물 사람 protagonist main person identity"],
  ["supporting-character", "Supporting character", "조연", "脇役", "配角", "A supporting character.", "조연 보조 인물 supporting person identity"],
  ["background-character", "Background character", "배경 인물", "背景の人物", "背景人物", "A background character.", "배경 엑스트라 사람 extra background identity"],
  ["same-person-angle", "Same person, another angle", "같은 인물의 다른 각도", "同じ人物の別の角度", "同一人物的另一角度", "This reference depicts the same person from another angle.", "동일 같은 인물 다른 각도 앵글 identity view angle"],
  ["same-person-time", "Same person, another moment", "같은 인물의 다른 시점", "同じ人物の別の時点", "同一人物的另一时刻", "This reference depicts the same person at another moment.", "동일 같은 인물 다른 시점 시간 identity moment time"],
  ["main-object", "Main object", "주요 사물", "主要な物体", "主要物体", "The main object in the scene.", "주요 사물 물체 제품 object identity"],
  ["prop", "Scene prop", "장면 소품", "場面の小道具", "场景道具", "A prop used in the scene.", "소품 도구 물건 prop object"],
  ["wardrobe", "Wardrobe reference", "의상 참조", "衣装の参照", "服装参考", "This reference depicts the wardrobe.", "의상 옷 복장 wardrobe clothing costume"],
  ["accessory", "Accessory reference", "액세서리 참조", "アクセサリーの参照", "配饰参考", "This reference depicts an accessory.", "액세서리 장신구 소품 accessory jewelry"],
  ["setting", "Setting reference", "공간 참조", "場所の参照", "环境参考", "This reference depicts the setting of the scene.", "장소 공간 환경 배경 setting location environment"],
  ["style", "Visual style reference", "시각 스타일 참조", "視覚スタイルの参照", "视觉风格参考", "This reference defines the visual style.", "스타일 미술 화풍 시각 visual style"],
  ["action", "Action reference", "동작 참조", "動作の参照", "动作参考", "This reference depicts the action.", "동작 행동 움직임 action motion"],
  ["pose", "Pose reference", "자세 참조", "ポーズの参照", "姿势参考", "This reference depicts the pose.", "자세 포즈 pose posture"],
  ["material", "Material reference", "재질 참조", "材質の参照", "材质参考", "This reference depicts the material and surface texture.", "재질 질감 표면 material texture"],
].map(([id, label, ko, ja, zh, text, keywords]) =>
  entry(id, "description", "identity", label, ko, ja, zh, text, keywords));

const usage = [
  ["keep-face", "Preserve reference facial identity", "참조 얼굴 정체성 유지", "参照の顔の同一性を維持", "保留参考面部身份", "Preserve the reference person's facial identity.", "얼굴 정체성 신원 face identity preserve retain", { group: "face", value: "reference" }],
  ["keep-hair", "Preserve reference hairstyle", "참조 헤어스타일 유지", "参照の髪型を維持", "保留参考发型", "Preserve the reference person's hairstyle.", "머리 헤어 머리카락 hair hairstyle preserve"],
  ["keep-build", "Preserve reference body build", "참조 체형 유지", "参照の体格を維持", "保留参考体型", "Preserve the reference person's body build.", "체형 몸 신체 build body preserve"],
  ["keep-skin", "Preserve reference skin tone", "참조 피부색 유지", "参照の肌の色を維持", "保留参考肤色", "Preserve the reference person's baseline skin tone.", "피부 피부색 skin tone preserve"],
  ["keep-wardrobe", "Preserve reference wardrobe", "참조 복장 유지", "参照の衣装を維持", "保留参考服装", "Preserve the reference wardrobe.", "의상 옷 복장 wardrobe clothing preserve", { group: "wardrobe", value: "reference" }],
  ["keep-source-wardrobe", "Preserve source wardrobe", "원본 복장 유지", "元動画の衣装を維持", "保留原视频服装", "Preserve the source video's wardrobe.", "원본 의상 옷 복장 source wardrobe clothing preserve", { group: "wardrobe", value: "source" }],
  ["allow-wardrobe", "Allow wardrobe changes", "복장 변경 허용", "衣装の変更を許可", "允许更改服装", "Allow changes to the wardrobe.", "의상 옷 복장 변경 허용 change wardrobe", { group: "wardrobe", value: "change" }],
  ["keep-source-action", "Preserve source action", "원본 동작 유지", "元動画の動作を維持", "保留原视频动作", "Preserve the source video's action.", "원본 동작 행동 움직임 연기 action motion performance preserve", { group: "action", value: "source" }],
  ["keep-source-expression", "Preserve source expression", "원본 표정 유지", "元動画の表情を維持", "保留原视频表情", "Preserve the source video's expression.", "원본 표정 감정 expression emotion preserve", { group: "expression", value: "source" }],
  ["keep-source-pose", "Preserve source posture", "원본 자세 유지", "元動画の姿勢を維持", "保留原视频姿势", "Preserve the source video's posture.", "원본 자세 포즈 posture pose preserve", { group: "pose", value: "source" }],
  ["keep-source-gaze", "Preserve source gaze", "원본 시선 유지", "元動画の視線を維持", "保留原视频视线", "Preserve the source video's gaze direction.", "원본 시선 눈 방향 gaze eyes preserve"],
  ["keep-source-timing", "Preserve source timing", "원본 타이밍 유지", "元動画のタイミングを維持", "保留原视频时序", "Preserve the source video's timing.", "원본 타이밍 시간 속도 timing rhythm preserve"],
  ["keep-source-visibility", "Preserve source visibility", "원본 순간별 가시성 유지", "元動画の各瞬間の可視性を維持", "保留原视频各时刻的可见性", "Preserve the source person's moment-by-moment visibility and occlusion.", "원본 보이는 가려짐 순간별 노출 visibility occlusion preserve"],
  ["keep-source-framing", "Preserve source framing", "원본 구도 유지", "元動画の構図を維持", "保留原视频构图", "Preserve the source video's framing.", "원본 구도 프레이밍 framing composition preserve", { group: "framing", value: "source" }],
  ["keep-source-camera", "Preserve source camera movement", "원본 카메라 움직임 유지", "元動画のカメラ移動を維持", "保留原视频镜头运动", "Preserve the source video's camera movement.", "원본 카메라 움직임 이동 camera movement preserve"],
  ["keep-source-light", "Preserve source lighting", "원본 조명 유지", "元動画の照明を維持", "保留原视频光照", "Preserve the source video's lighting.", "원본 조명 빛 광원 lighting light preserve", { group: "lighting", value: "source" }],
  ["keep-source-background", "Preserve source background", "원본 배경 유지", "元動画の背景を維持", "保留原视频背景", "Preserve the source video's background.", "원본 배경 장소 환경 background environment preserve", { group: "background", value: "source" }],
  ["keep-others", "Keep other people unchanged", "다른 인물 유지", "他の人物を変更しない", "保持其他人物不变", "Keep all other people unchanged.", "다른 인물 사람 유지 everyone other people preserve"],
  ["keep-objects", "Keep surrounding objects unchanged", "주변 사물 유지", "周囲の物体を変更しない", "保持周围物体不变", "Keep surrounding objects unchanged.", "주변 사물 물체 소품 objects props preserve"],
  ["only-face", "Use facial identity only", "얼굴 정체성만 가져오기", "顔の同一性だけを使用", "仅使用面部身份", "Use only the reference person's facial identity.", "얼굴 정체성 신원 만 가져오기 face identity only transfer", { group: "transfer", value: "face-only" }],
  ["only-wardrobe", "Use wardrobe only", "의상만 가져오기", "衣装だけを使用", "仅使用服装", "Use only the reference wardrobe.", "의상 옷 복장 만 가져오기 wardrobe clothing only transfer", { group: "transfer", value: "wardrobe-only" }],
  ["only-pose", "Use pose only", "자세만 가져오기", "ポーズだけを使用", "仅使用姿势", "Use only the reference pose.", "자세 포즈 만 가져오기 pose posture only transfer", { group: "transfer", value: "pose-only" }],
  ["only-colors", "Use color palette only", "색감만 가져오기", "配色だけを使用", "仅使用配色", "Use only the reference color palette.", "색감 색상 색조 팔레트 만 가져오기 colors palette only transfer", { group: "transfer", value: "color-only" }],
  ["only-texture", "Use texture only", "질감만 가져오기", "質感だけを使用", "仅使用质感", "Use only the reference surface texture.", "질감 재질 표면 만 가져오기 texture material only transfer", { group: "transfer", value: "texture-only" }],
  ["exclude-background", "Exclude reference background", "참조 배경 제외", "参照の背景を除外", "排除参考背景", "Do not copy the reference background.", "참조 배경 제외 가져오지 않음 exclude background"],
  ["exclude-framing", "Exclude reference framing", "참조 구도 제외", "参照の構図を除外", "排除参考构图", "Do not copy the reference framing.", "참조 구도 프레이밍 제외 exclude framing composition"],
  ["replace-person", "Replace selected person only", "선택한 인물만 교체", "選択した人物だけを置換", "仅替换选定人物", "Replace only the selected person; keep everyone else unchanged.", "선택한 인물 사람 교체 대체 replace person only", { group: "operation", value: "replace" }],
  ["replace-object", "Replace selected object only", "선택한 사물만 교체", "選択した物体だけを置換", "仅替换选定物体", "Replace only the selected object; keep surrounding objects unchanged.", "선택한 사물 물체 교체 대체 replace object only", { group: "operation", value: "replace" }],
  ["keep-scale", "Preserve source scale", "원본 크기 비례 유지", "元動画の大きさと比率を維持", "保留原视频大小比例", "Preserve the source subject's scale and proportions within the frame.", "원본 크기 비례 화면 비율 scale proportions preserve"],
  ["keep-shadows", "Match source shadows", "원본 그림자에 맞추기", "元動画の影に合わせる", "匹配原视频阴影", "Match the source scene's shadows.", "원본 그림자 그림자맞춤 shadow lighting match"],
  ["keep-contact", "Preserve source contact", "원본 접촉 관계 유지", "元動画の接触関係を維持", "保留原视频接触关系", "Preserve the source subject's contact with surrounding surfaces and objects.", "원본 접촉 물체 관계 손 바닥 contact surfaces interaction preserve"],
  ["use-shape", "Use reference object shape", "참조 사물 형태 가져오기", "参照物体の形状を使用", "使用参考物体形状", "Use the reference object's shape.", "참조 사물 물체 모양 형태 shape object transfer"],
  ["use-material", "Use reference material", "참조 재질 가져오기", "参照の材質を使用", "使用参考材质", "Use the reference material.", "참조 재질 질감 소재 material texture transfer"],
  ["use-style", "Use reference visual style", "참조 시각 스타일 가져오기", "参照の視覚スタイルを使用", "使用参考视觉风格", "Use the reference visual style.", "참조 시각 화풍 스타일 visual style transfer"],
  ["remove-person", "Remove selected person", "선택한 인물 제거", "選択した人物を除去", "移除选定人物", "Remove the selected person.", "인물 사람 제거 삭제 remove erase person", { group: "operation", value: "remove", safety: "remove" }],
].map(([id, label, ko, ja, zh, text, keywords, rule]) => {
  const extra = rule ? { rule: { group: rule.group, value: rule.value } } : {};
  if (rule?.safety) extra.safety = rule.safety;
  return entry(id, "usage_rules", "use", label, ko, ja, zh, text, keywords, extra);
});

const targetTypes = [
  ["person", "Person", "인물", "人物", "人物", "person", "사람 인물 person subject character"],
  ["man", "Man", "남성", "男性", "男性", "man", "남성 남자 man male"],
  ["woman", "Woman", "여성", "女性", "女性", "woman", "여성 여자 woman female"],
  ["object", "Object", "사물", "物体", "物体", "object", "물체 사물 제품 소품 object prop item"],
];
const positions = [
  ["upper-left", "upper left", "왼쪽 위", "左上", "左上", "in the upper-left corner", "좌측 상단 왼쪽 위 upper left top"],
  ["upper-center", "upper center", "중앙 위", "上中央", "上方中央", "in the upper center", "상단 중앙 가운데 위 upper center top"],
  ["upper-right", "upper right", "오른쪽 위", "右上", "右上", "in the upper-right corner", "우측 상단 오른쪽 위 upper right top"],
  ["left", "left", "왼쪽", "左", "左侧", "on the left", "좌측 왼쪽 left"],
  ["center", "center", "중앙", "中央", "中央", "in the center", "중앙 가운데 중심 center middle"],
  ["right", "right", "오른쪽", "右", "右侧", "on the right", "우측 오른쪽 right"],
  ["lower-left", "lower left", "왼쪽 아래", "左下", "左下", "in the lower-left corner", "좌측 하단 왼쪽 아래 lower left bottom"],
  ["lower-center", "lower center", "중앙 아래", "下中央", "下方中央", "in the lower center", "하단 중앙 가운데 아래 lower center bottom"],
  ["lower-right", "lower right", "오른쪽 아래", "右下", "右下", "in the lower-right corner", "우측 하단 오른쪽 아래 lower right bottom"],
  ["foreground", "foreground", "전경", "前景", "前景", "in the foreground", "전경 앞 앞쪽 foreground front"],
  ["background", "background", "배경", "背景", "背景", "in the background", "배경 뒤 뒤쪽 background rear"],
  ["closest", "closest to camera", "카메라에 가장 가까운", "カメラに最も近い", "最靠近镜头", "closest to the camera", "카메라 가장 가까운 가까이 closest nearest camera"],
  ["farthest", "farthest from camera", "카메라에서 가장 먼", "カメラから最も遠い", "离镜头最远", "farthest from the camera", "카메라 가장 먼 멀리 farthest furthest distant camera"],
];
const targets = positions.flatMap(([position, en, ko, ja, zh, phrase, keywords]) =>
  targetTypes.map(([type, name, koName, jaName, zhName, noun, typeKeywords]) =>
    entry(`target-${position}-${type}`, "replaces_what", "position", `${name} · ${en}`,
      `${ko} ${koName}`, `${ja}の${jaName}`, `${zh}的${zhName}`, `the ${noun} ${phrase}`,
      `${keywords} ${typeKeywords}`)));

const colors = [
  ["red", "red", "붉은", "赤", "红色", "빨간 빨강 붉은 빨간색 적색 red"],
  ["blue", "blue", "파란", "青", "蓝色", "파란 파랑 파란색 청색 blue"],
  ["yellow", "yellow", "노란", "黄色", "黄色", "노란 노랑 노란색 황색 yellow"],
];
const markedTargets = colors.flatMap(([color, en, ko, ja, zh, keywords]) =>
  targetTypes.flatMap(([type, name, koName, jaName, zhName, noun, typeKeywords]) => [
    entry(`target-mark-${color}-${type}`, "replaces_what", "marks", `${name} marked in ${en}`,
      `${ko} 표시의 ${koName}`, `${ja}で印を付けた${jaName}`, `${zh}标记的${zhName}`,
      `the ${noun} marked in ${en}`, `${keywords} ${typeKeywords} 표시 표식 선 mark marked`),
    entry(`target-circle-${color}-${type}`, "replaces_what", "marks", `${name} inside ${en} circle`,
      `${ko} 원 안의 ${koName}`, `${ja}い円の中の${jaName}`, `${zh}圆圈中的${zhName}`,
      `the ${noun} inside the ${en} circle`, `${keywords} ${typeKeywords} 표시 원 동그라미 circle circled`),
  ]));

const actions = [
  ["choose", "Choose work reference", "작품 참조에서 선택", "作品の参照から選択", "从作品参考中选择", "작품 참조 선택 choose work reference", "choose"],
  ["attach", "Import reference file", "참조 파일 불러오기", "参照ファイルを読み込む", "导入参考文件", "이미지 영상 사진 비디오 파일 불러오기 업로드 image video import attach file", "attach"],
  ["capture", "Capture and mark video frame", "영상 프레임 캡처·표시", "動画フレームを取得して印を付ける", "截取视频帧并标记", "영상 비디오 프레임 캡처 표시 재생헤드 video frame capture scrub mark", "mark-video"],
  ["mark-image", "Import and mark image", "이미지 불러오기·표시", "画像を読み込んで印を付ける", "导入图片并标记", "이미지 사진 그림 표시 브러쉬 브러시 image picture brush mark", "mark-image"],
  ["remark", "Edit reference marks", "참조 표시 다시 그리기", "参照の印を描き直す", "重新编辑参考标记", "표시 다시 수정 그림 브러쉬 브러시 edit marks remark brush", "remark"],
  ["preview", "Preview replacement reference", "대체 참조 미리보기", "置換参照をプレビュー", "预览替换参考", "미리보기 보기 재생 preview play reference", "preview"],
].map(([id, label, ko, ja, zh, keywords, action]) =>
  entry(`action-${id}`, "replaces", "actions", label, ko, ja, zh, "", keywords, { action }));

export const BUILTIN_CAST_PRESETS = [...descriptions, ...usage, ...targets, ...markedTargets, ...actions];

const pieceDescriptions = [
  ["edit-source", "Original video for editing", "편집할 원본 영상", "編集する元動画", "用于编辑的原视频", "This reference is the original video to be edited.", "원본 영상 편집 video edit source", "scene"],
  ["scene", "Scene layout reference", "장면 배치 참조", "場面配置の参照", "场景布局参考", "This reference shows the layout of the scene.", "장면 공간 배치 scene setting layout", "scene"],
  ["environment", "Environment reference", "주변 환경 참조", "周囲の環境の参照", "周围环境参考", "This reference depicts the surrounding environment.", "환경 주변 장소 environment location", "scene"],
  ["object", "Object design reference", "사물 디자인 참조", "物体デザインの参照", "物体设计参考", "This reference depicts the object's design and construction.", "사물 물체 제품 디자인 object product design", "scene"],
  ["lighting", "Lighting reference", "조명 참조", "照明の参照", "光照参考", "This reference depicts the lighting of the scene.", "조명 빛 광원 lighting light", "scene"],
  ["palette", "Color palette reference", "색감 팔레트 참조", "配色の参照", "配色参考", "This reference depicts the color palette.", "색감 색상 색조 팔레트 color palette", "scene"],
  ["composition", "Composition reference", "화면 구성 참조", "画面構成の参照", "画面构图参考", "This reference shows the composition and subject placement.", "화면 구도 구성 배치 composition framing", "camera"],
  ["camera", "Camera movement reference", "카메라 움직임 참조", "カメラ移動の参照", "镜头运动参考", "This reference demonstrates the camera movement.", "카메라 이동 움직임 camera movement", "camera"],
  ["performance", "Performance reference", "연기 참조", "演技の参照", "表演参考", "This reference shows the performance and gestures.", "연기 동작 제스처 performance gesture action", "tempo"],
  ["pacing", "Pacing reference", "진행 속도 참조", "進行速度の参照", "节奏速度参考", "This reference demonstrates the pacing of the scene.", "속도 진행 템포 리듬 pacing timing rhythm", "tempo"],
  ["soundtrack", "Existing soundtrack", "기존 사운드트랙", "既存のサウンドトラック", "现有音轨", "This reference contains the existing soundtrack.", "원본 음성 소리 사운드트랙 soundtrack recording audio", "audio"],
  ["ambient", "Ambient sound recording", "환경음 녹음", "環境音の録音", "环境声录音", "This reference is a recording of the ambient sound.", "환경음 배경음 현장음 ambient background sound", "audio"],
  ["voice", "Voice reference recording", "목소리 참조 녹음", "声の参照録音", "声音参考录音", "This reference is a recording of a speaker's voice.", "목소리 음성 화자 음색 voice speaker timbre", "audio"],
  ["identity", "Person appearance reference", "인물 외모 참조", "人物外見の参照", "人物外貌参考", "This reference depicts the person's baseline appearance.", "인물 얼굴 신원 외모 identity face appearance", "identity"],
  ["style", "Rendering style reference", "표현 스타일 참조", "表現スタイルの参照", "表现风格参考", "This reference demonstrates the rendering style.", "시각 화풍 미술 표현 스타일 visual rendering style", "scene"],
  ["locator", "Marked target identification", "표시된 대상 식별", "印を付けた対象の識別", "标记对象识别", "The colored mark in this reference identifies the target of the edit.", "표시 표식 붉은 원 식별 타깃 mark target identification", "editing"],
].map(([id, label, ko, ja, zh, text, keywords, category]) =>
  entry(`piece-${id}`, "piece_description", category, label, ko, ja, zh, text, keywords));

const pieceUsage = [
  ["keep-original", "Keep unchanged source details", "수정하지 않은 원본 요소 유지", "変更しない元動画の要素を維持", "保留未修改的原视频细节", "Keep source details unchanged unless the editing instructions explicitly change them.", "원본 유지 편집 변경 preserve source unchanged", "editing"],
  ["keep-camera", "Keep reference camera movement", "참조 카메라 움직임 유지", "参照のカメラ移動を維持", "保留参考镜头运动", "Keep the reference camera movement.", "카메라 이동 움직임 유지 camera movement keep", "camera", { group: "camera", value: "keep" }],
  ["only-camera", "Borrow camera movement only", "카메라 움직임만 가져오기", "カメラ移動だけを取り入れる", "仅借用镜头运动", "Borrow only the camera movement from this reference, not its people or setting.", "카메라 이동 만 camera movement only transfer", "camera", { group: "transfer", value: "camera-only" }],
  ["keep-framing", "Keep reference composition", "참조 화면 구성 유지", "参照の画面構成を維持", "保留参考构图", "Keep the reference composition and framing.", "구도 프레이밍 화면 구성 유지 framing composition keep", "camera", { group: "framing", value: "keep" }],
  ["keep-action", "Keep reference action", "참조 동작 유지", "参照の動作を維持", "保留参考动作", "Keep the reference action and gestures.", "동작 행동 연기 제스처 유지 action gesture keep", "tempo", { group: "action", value: "keep" }],
  ["only-action", "Borrow action only", "동작만 가져오기", "動作だけを取り入れる", "仅借用动作", "Borrow only the action from this reference, not its appearance or background.", "동작 행동 연기 만 action motion only transfer", "tempo", { group: "transfer", value: "action-only" }],
  ["keep-timing", "Keep reference event timing", "참조 사건 타이밍 유지", "参照の出来事のタイミングを維持", "保留参考事件时序", "Keep the timing and order of the reference events.", "사건 순서 시간 타이밍 유지 timing sequence keep", "tempo", { group: "timing", value: "keep" }],
  ["only-pacing", "Borrow pacing only", "진행 속도만 가져오기", "進行速度だけを取り入れる", "仅借用节奏速度", "Borrow only the pacing from this reference, not its events or subjects.", "진행 속도 템포 리듬 만 pacing rhythm only transfer", "tempo", { group: "transfer", value: "pacing-only" }],
  ["keep-setting", "Keep reference environment", "참조 환경 유지", "参照の環境を維持", "保留参考环境", "Keep the reference environment and spatial layout.", "배경 환경 장소 공간 배치 유지 environment layout keep", "scene", { group: "background", value: "keep" }],
  ["keep-light", "Keep reference lighting", "참조 조명 유지", "参照の照明を維持", "保留参考光照", "Keep the reference lighting and shadow directions.", "조명 그림자 방향 유지 lighting shadows keep", "scene", { group: "lighting", value: "keep" }],
  ["only-colors", "Borrow color palette only", "색감 팔레트만 가져오기", "配色だけを取り入れる", "仅借用配色", "Borrow only the color palette from this reference, not its scene content.", "색감 색조 색상 팔레트 만 color palette only transfer", "scene", { group: "transfer", value: "colors-only" }],
  ["only-material", "Borrow material appearance only", "재질 표현만 가져오기", "材質の見た目だけを取り入れる", "仅借用材质外观", "Borrow only the material appearance from this reference, not the object's shape.", "재질 소재 질감 표면 만 material texture only transfer", "scene", { group: "transfer", value: "material-only" }],
  ["only-style", "Borrow rendering style only", "표현 스타일만 가져오기", "表現スタイルだけを取り入れる", "仅借用表现风格", "Borrow only the rendering style from this reference, not its characters or composition.", "화풍 시각 표현 스타일 만 style rendering only transfer", "scene", { group: "transfer", value: "style-only" }],
  ["only-face", "Borrow facial identity only", "얼굴 정체성만 가져오기", "顔の同一性だけを取り入れる", "仅借用面部身份", "Borrow only the person's facial identity from this reference, not their pose or surroundings.", "인물 얼굴 정체성 신원 만 face identity only transfer", "identity", { group: "transfer", value: "face-only" }],
  ["copy-audio", "Reuse reference audio track", "참조 오디오 트랙 재사용", "参照音声トラックを再利用", "重用参考音轨", "Reuse the existing reference audio track with its original sounds and timing.", "오디오 음성 사운드 원본 재사용 audio sound reuse copy", "audio", { group: "audio", value: "copy" }],
  ["only-voice", "Borrow voice timbre only", "목소리 음색만 가져오기", "声の音色だけを取り入れる", "仅借用声音音色", "Use this reference only for voice timbre; use the dialogue specified for the target video.", "목소리 음성 음색 만 대사 voice timbre only", "audio", { group: "audio", value: "timbre-only" }],
  ["only-ambient", "Use ambient sound only", "환경음만 사용", "環境音だけを使用", "仅使用环境声", "Use only the ambient sounds from this reference; exclude its speech and music.", "환경음 현장음 배경음 만 대사 음악 제외 ambient sound only", "audio", { group: "audio", value: "ambient-only" }],
  ["no-audio", "Exclude reference audio", "참조 오디오 제외", "参照音声を除外", "排除参考音频", "Do not use the audio from this reference.", "오디오 음성 소리 제외 audio sound exclude", "audio", { group: "audio", value: "exclude" }],
  ["no-background", "Exclude reference surroundings", "참조 주변 환경 제외", "参照の周囲の環境を除外", "排除参考周围环境", "Do not transfer the reference background or surrounding objects.", "배경 주변 환경 사물 제외 background objects exclude", "editing", { group: "background", value: "exclude" }],
  ["no-camera", "Exclude reference camera movement", "참조 카메라 움직임 제외", "参照のカメラ移動を除外", "排除参考镜头运动", "Do not transfer the reference camera movement.", "카메라 이동 움직임 제외 camera movement exclude", "editing", { group: "camera", value: "exclude" }],
  ["no-framing", "Exclude reference composition", "참조 화면 구성 제외", "参照の画面構成を除外", "排除参考构图", "Do not transfer the reference composition or framing.", "구도 화면 구성 프레이밍 제외 composition framing exclude", "editing", { group: "framing", value: "exclude" }],
  ["locator-only", "Use marks for identification only", "표시는 식별에만 사용", "印は識別だけに使用", "标记仅用于识别", "Use the colored marks only to identify the edit target; do not reproduce the marks in the target video.", "표시 표식 붉은 원 타깃 식별 만 mark locator identify", "editing"],
  ["replace-object", "Replace identified object only", "지정한 사물만 교체", "指定した物体だけを置換", "仅替换指定物体", "Replace only the identified object and keep surrounding objects unchanged.", "사물 물체 제품 교체 대체 object replace", "editing", { group: "operation", value: "replace" }],
  ["remove-object", "Remove identified object only", "지정한 사물만 제거", "指定した物体だけを除去", "仅移除指定物体", "Remove only the identified object and keep the rest of the scene unchanged.", "사물 물체 제품 제거 삭제 object remove", "editing", { group: "operation", value: "remove" }],
].map(([id, label, ko, ja, zh, text, keywords, category, rule]) =>
  entry(`piece-${id}`, "piece_usage_rules", category, label, ko, ja, zh, text, keywords,
    rule ? { rule } : {}));

export const BUILTIN_PIECE_REFERENCE_PRESETS = [...pieceDescriptions, ...pieceUsage];

export const PIECE_REFERENCE_FIELD_HELP = {
  piece_description: {
    title: "Reference description", section: "subject_definitions",
    note: "Describe what this work reference depicts or records and its role. Put instructions about what to keep, change or borrow in Reference usage rules. The reference is defined where it is actually used.",
    examples: [
      ["This clip is the original car-interior video to be edited.", "Identify the edit source"],
      ["The image shows the layout of the station waiting room.", "Explain the spatial setting"],
      ["This photo shows the worn brass finish of the door handle.", "Identify an object's material"],
      ["The clip demonstrates a camera orbit around a stationary sculpture.", "Describe camera behavior"],
      ["This recording contains rain, footsteps and a distant train.", "Describe ambient audio content"],
      ["The speaker in this recording is the off-screen narrator.", "Identify the speaker of a voice reference"],
      ["This illustration shows the film's ink-and-watercolor rendering style.", "Describe the visual treatment"],
      ["The athlete pauses before landing; the clip shows the full movement.", "Explain an action's sequence"],
      ["This portrait shows the same performer as the person in the source video.", "Clarify identity across references"],
      ["The red outline identifies the suitcase intended for editing.", "Explain an identification annotation"],
    ],
  },
  piece_usage_rules: {
    title: "Reference usage rules", section: "retention_analysis",
    note: "Specify what to keep, change, exclude or borrow from this work reference. Rules follow the reference's actual usage scope and remain separate from rules with a different scope. They describe model intent; audio reuse and editing settings still control the workflow.",
    examples: [
      ["Keep the source camera and passenger positions; change only the selected performer.", "Limit a video edit while preserving its staging"],
      ["Borrow the camera orbit, but not the sculpture or gallery.", "Transfer camera movement without scene content"],
      ["Use the photo's brass texture on the target handle, keeping the target handle's shape.", "Transfer material without replacing geometry"],
      ["Match the illustration's palette without copying its characters or layout.", "Transfer color treatment only"],
      ["Preserve the athlete's pauses and landing timing throughout the movement.", "Retain the timing of a performance"],
      ["Use the voice sample's timbre for the dialogue entered in the segment.", "Borrow voice quality without copying words"],
      ["Reuse the source soundtrack without adding or replacing recorded sounds.", "Preserve the existing audio track"],
      ["Use the rain ambience; exclude the spoken announcement and music.", "Select one part of the reference sound"],
      ["Remove the marked suitcase while keeping the platform and travelers unchanged.", "Limit removal to an identified object"],
      ["Use the red outline to locate the target; do not show that outline in the result.", "Exclude identification marks from the output"],
    ],
  },
};

export const CAST_REFERENCE_FIELD_HELP = {
  description: {
    title: "Reference description", section: "subject_definitions",
    note: "Describe this cast member's identity, role or background. Instructions to keep, change or borrow an appearance belong in Reference usage rules.",
    examples: [
      ["She is an emergency nurse working the night shift.", "Occupation and everyday role"],
      ["This woman is the main character's mother.", "Family relationship in the story"],
      ["He is reserved and rarely speaks first.", "Personality not visible in a still"],
      ["This is the same actor during his younger years.", "One identity at a different age"],
      ["The masked rider is the missing prince.", "Identity concealed by a costume"],
      ["Of the twins, this reference depicts the older brother.", "Distinguishing similar-looking characters"],
      ["He is a left-handed violinist.", "A habitual skill or personal trait"],
      ["This voice belongs to the unseen narrator.", "Identity of an off-screen cast member"],
      ["She grew up abroad and returned to her hometown.", "Personal history unseen in a still"],
      ["These references show the detective with a short bob haircut.", "Describe the appearance shown, not an edit request"],
    ],
  },
  usage_rules: {
    title: "Reference usage rules", section: "retention_analysis",
    note: "State what this cast member should keep, change or borrow. These rules apply only to segments using this cast member; the examples are instructions, not identity definitions.",
    examples: [
      ["Use her facial identity from the portraits, but not their backgrounds.", "Keep identity while excluding the portrait setting"],
      ["Change her long hair to a short bob; keep her face recognizable.", "Request a hairstyle change instead of redefining identity"],
      ["Keep the source woman's closed eyes and tired expression.", "Retain the original performance and eye state"],
      ["Replace only his jacket with the reference coat; keep his face and trousers.", "Limit the edit to one part of the wardrobe"],
      ["Keep the source dancer's posture and limb movements throughout the shot.", "Retain full-body motion rather than the reference pose"],
      ["Render this character with the reference's ink-line style, not its costume.", "Transfer rendering style without transferring clothing"],
      ["Use the voice reference for timbre only; speak the segment's dialogue.", "Use a voice quality without copying recorded words"],
      ["When the source person passes behind the door, preserve that occlusion.", "Retain visibility as the person becomes hidden"],
      ["Do not transfer the tattoo visible on the reference actor's arm.", "Exclude a particular reference detail"],
      ["Replace the selected woman and leave the other passengers unchanged.", "Keep bystanders outside the replacement target"],
    ],
  },
  replaces_what: {
    title: "Replacement target", section: "retention_analysis",
    note: "Name the person in the source who should be replaced, not the new cast member. Pair the description with Replacement reference. This field identifies a target; it does not switch the operation to removal.",
    examples: [
      ["The person partly hidden behind the window pillar.", "Identify a partially occluded target"],
      ["The man wearing the blue fedora.", "Identify one person by distinctive clothing"],
      ["The person pouring tea into the cup.", "Identify the target by a particular action"],
      ["The child holding the mother's hand.", "Identify a person through their relation to another"],
      ["The person inside the red circle.", "Use the mark drawn on the replacement reference"],
      ["The woman seated in the car's rear passenger seat.", "Identify a physical seat in the source scene"],
      ["The person visible only in the mirror reflection.", "Specify a reflected person rather than someone in front of the mirror"],
      ["The human silhouette behind the translucent curtain.", "Identify a target whose face is not visible"],
      ["The person who enters after the door opens.", "Identify the target through the sequence of events"],
      ["The performer shown in the inset panel of the split-screen.", "Identify a target within a separate visual panel"],
    ],
  },
  replaces: {
    title: "Replacement reference", section: "retention_analysis",
    note: "Attach an image or video that locates the person being replaced. The segment still supplies the edit source and action; this cast member's appearance comes from their own references. Marks are visual hints, not masks or guaranteed tracking.",
    examples: [
      ["Choose the exact original video already used by the segment.", "Use the same source to avoid mismatched scenes"],
      ["Capture one frame and draw a red circle around the target person.", "Point to the target with a simple visual mark"],
      ["Attach a group photo, number the crowded figures, and identify person number 3.", "Disambiguate one person in a dense crowd"],
      ["Attach a crop of the target's upper body from the source frame.", "Make a small target easier to inspect without cropping the edit source"],
      ["Capture the moment when the late-arriving actor first enters.", "Locate a target absent from the opening frame"],
      ["Capture the target just before another passenger hides them.", "Use an unobscured moment to identify a later-hidden target"],
      ["Mark the reflected figure inside the mirror, not the person beside it.", "Point to a target that exists in a reflection"],
      ["Attach a still where the target's distinctive striped sleeve is clear.", "Make a clothing-based target description verifiable"],
      ["Attach an unmarked still showing the target in the rear car seat.", "Match a seat-based description to the source layout"],
      ["Attach a source excerpt showing the target moving between rooms.", "Connect one target across a change of setting"],
    ],
  },
};

function normalized(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchesCastPreset(preset, query) {
  const words = normalized(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = normalized([preset.label, preset.ko, preset.ja, preset.zh, preset.text,
    preset.category, CAST_PRESET_CATEGORIES[preset.category], preset.keywords].join(" "));
  return words.every(word => haystack.includes(word));
}

export function appendCastPreset(existing, text) {
  const current = String(existing ?? "");
  const addition = String(text ?? "").trim();
  if (!addition) return current;
  if (!current.trim()) return current + addition;
  if (/,\s*$/.test(current)) return current + (/\s$/.test(current) ? "" : " ") + addition;
  return current + ", " + addition;
}
