/** 给站内路径加上 base（部署在 /chop/ 子路径下） */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = path.replace(/^\//, '');
  return `${base}/${p}`;
}
