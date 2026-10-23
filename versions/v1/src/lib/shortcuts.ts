export interface ShortcutHelp {
  keys: string;
  description: string;
  group: string;
}

export const SHORTCUTS: ShortcutHelp[] = [
  { group: '视图', keys: '左键拖拽', description: '主视口自由旋转' },
  { group: '视图', keys: '滚轮', description: '缩放当前视口' },
  { group: '视图', keys: '右键拖拽', description: '主视口平移；正交视口平移' },
  { group: '视图', keys: 'R', description: '开启 / 停止模型自动旋转' },
  { group: '视图', keys: 'W', description: '切换线框显示' },
  { group: '视图', keys: 'F', description: '适合全部视图' },
  { group: '视图', keys: 'Shift + F', description: '聚焦选中图元' },
  { group: '视图', keys: 'Esc', description: '取消当前工具 / 关闭弹窗' },
  { group: '工具', keys: 'P', description: '点创建工具' },
  { group: '工具', keys: 'S', description: '线段创建工具' },
  { group: '工具', keys: 'L', description: '直线创建工具' },
  { group: '工具', keys: 'N', description: '平面创建工具（依次点三点）' },
  { group: '选择', keys: 'Ctrl + 点击', description: '多选图元' },
  { group: '选择', keys: 'Del / Backspace', description: '删除选中的整体图元' },
  { group: '编辑', keys: 'Ctrl + Z', description: '撤销' },
  { group: '编辑', keys: 'Ctrl + Shift + Z / Ctrl + Y', description: '重做' },
  { group: '编辑', keys: 'Ctrl + S', description: '保存 .geojson 工程' },
  { group: '编辑', keys: 'Ctrl + O', description: '打开工程' },
  { group: '编辑', keys: 'Ctrl + N', description: '新建场景' },
  { group: '编辑', keys: 'Ctrl + D', description: '删除选中' },
  { group: '建模', keys: '拖动白色顶点', description: '实时改变几何体并刷新度量' },
  { group: '建模', keys: 'Shift + 拖拽顶点', description: '按 0.25 网格吸附' },
];

export const GUIDE_STEPS = [
  {
    title: '1. 创建图元',
    detail: '在左侧「创建」面板选择点、线、面、圆或八种预设几何体；也可以使用工具栏的连续创建工具，在视口中依次点击顶点。',
  },
  {
    title: '2. 选择与变换',
    detail: '主视口左键拖拽旋转、滚轮缩放、右键平移；正交视口支持平移和缩放。拖动白色顶点可实时变形，所有关联度量会同步刷新。',
  },
  {
    title: '3. 构造与度量',
    detail: '按住 Ctrl 多选点、线、面或立体，在「构造」中作中点、交点、垂足、投影点、三点平面；在「度量」中计算长度、角度、线面角、二面角、异面角与距离。',
  },
  {
    title: '4. 空间向量',
    detail: '选中两点可直接生成向量，或打开向量对话框输入分量。右侧「向量」页支持加减、数乘、点积、叉积、模长、夹角、投影与方向余弦，并给出向量法求线面角/二面角的完整步骤。',
  },
  {
    title: '5. 截面与导出',
    detail: '切换选择模式为「面」可以选择几何体的面，选择立体与平面后生成截面与切割效果。工程保存为 .geojson，并可导出 2× PNG、SVG、OBJ。',
  },
];
