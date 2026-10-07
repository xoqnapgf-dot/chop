# 用法：python3 gen.py NAME SIZE "prompt" [background] [ref1.jpg,ref2.jpg]
# 通过中转站调用 gpt-image-2.5（sunburst，low 质量）生成一张图，存到 gen/NAME.png。
# 密钥只从环境变量读取，不写进仓库：
#   export IMG_API_BASE=https://api.example.com/v1
#   export IMG_API_KEY=sk-...
#   export IMG_BUDGET=4.5          # 本次最多花多少 credits（可选）
import json, os, sys, time, urllib.request, base64
W = os.path.dirname(os.path.abspath(__file__))
BASE, KEY = os.environ['IMG_API_BASE'], os.environ['IMG_API_KEY']
BUDGET = float(os.environ.get('IMG_BUDGET', '4.5'))
os.makedirs(W + '/gen', exist_ok=True)
LEDGER = W + '/gen/ledger.jsonl'
START = W + '/gen/start_balance.txt'
MAX_CALLS = 70


def req(method, path, body=None):
    r = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=120) as f:
        return json.loads(f.read())


name, size, prompt = sys.argv[1], sys.argv[2], sys.argv[3]
bg = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else 'auto'
n_done = sum(1 for _ in open(LEDGER)) if os.path.exists(LEDGER) else 0
if n_done >= MAX_CALLS:
    sys.exit('budget guard: too many calls')
bal = req('GET', '/user/balance')['remain_credits']
if not os.path.exists(START):
    open(START, 'w').write(str(bal))
spent = float(open(START).read()) - bal
print(f'credits remaining {bal:.4f}, spent so far {spent:.4f}', flush=True)
if spent > BUDGET:
    sys.exit(f'budget guard: spent > {BUDGET} credits')
body = {'model': 'gpt-image-2.5-sunburst', 'prompt': prompt, 'size': size, 'resolution': '1k', 'quality': 'low', 'n': 1,
        'output_format': 'png', 'background': bg, 'moderation': 'low'}
if len(sys.argv) > 5 and sys.argv[5]:
    body['image_urls'] = ['data:image/jpeg;base64,' + base64.b64encode(open(p, 'rb').read()).decode() for p in sys.argv[5].split(',')]
sub = req('POST', '/images/generations', body)
print('submit', json.dumps(sub)[:300], flush=True)
tid = sub['data'][0]['task_id'] if isinstance(sub.get('data'), list) else sub['data']['task_id']
res = None
for i in range(90):
    time.sleep(4)
    try:
        res = req('GET', '/tasks/' + tid)
    except Exception as e:
        try:
            res = req('POST', '/tasks/status', {'task_id': tid})
        except Exception as e2:
            print('poll err', e, e2)
            continue
    st = res.get('data', {}).get('status')
    if st in ('completed', 'failed'):
        break
d = res['data']
print('status', d.get('status'), 'usage', d.get('usage'), 'cost', d.get('cost'), flush=True)
open(LEDGER, 'a').write(json.dumps({'name': name, 'size': size, 'bg': bg, 'status': d.get('status'), 'usage': d.get('usage'), 't': time.time()}) + '\n')
if d.get('status') == 'completed':
    url = d['result']['images'][0]['url'][0]
    urllib.request.urlretrieve(url, W + '/gen/' + name + '.png')
    print('saved', name)
else:
    print(json.dumps(res)[:800])
