// 把 Markdown 表格包进一个可横向滚动的外框。
// 表格本身保持 display: table，列宽才能铺满整行；窄屏放不下时由外框滚动。
import { defineHastPlugin } from 'satteri';

export const tableWrap = defineHastPlugin({
  name: 'table-wrap',
  element: {
    filter: ['table'],
    visit(node, ctx) {
      ctx.replaceNode(node, { type: 'element', tagName: 'div', properties: { className: ['table-wrap'] }, children: [node] });
    },
  },
});
