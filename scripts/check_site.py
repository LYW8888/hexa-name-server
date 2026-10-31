"""Check the deployed naming page, built assets and an anonymous synthetic request."""
import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


class CheckFailure(Exception):
    pass


class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.root=False; self.modules=[]; self.assets=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if attrs.get('id')=='root': self.root=True
        if tag=='script' and attrs.get('type')=='module' and attrs.get('src','').startswith('/assets/'):
            self.modules.append(attrs['src']); self.assets.append(attrs['src'])
        if tag=='link' and attrs.get('rel') in ('stylesheet','modulepreload') and attrs.get('href','').startswith('/assets/'):
            self.assets.append(attrs['href'])


def check_site(base_url, timeout=10, expected_modules=None):
    parsed=urllib.parse.urlsplit(base_url)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('','/'):
        raise CheckFailure('请填写不含账号、查询参数或子路径的站点根地址。')
    base=base_url.rstrip('/')+'/'
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({})) if parsed.hostname in ('localhost','127.0.0.1','::1') else urllib.request.build_opener()
    def request(path, data=None):
        raw=json.dumps(data,ensure_ascii=False).encode() if data is not None else None
        headers={'User-Agent':'Xuming-deployment-check/1.0','Cache-Control':'no-cache'}
        if raw is not None:headers['Content-Type']='application/json'
        try:
            with opener.open(urllib.request.Request(urllib.parse.urljoin(base,path),data=raw,headers=headers),timeout=timeout) as response:
                result=response.read(2*1024*1024+1)
                if len(result)>2*1024*1024:raise CheckFailure('响应内容异常过大。')
                return result, response.headers.get_content_type()
        except urllib.error.HTTPError as exc:
            raise CheckFailure(f'{path} 返回 HTTP {exc.code}，请检查服务、代理路由和构建文件。') from exc
        except (OSError,urllib.error.URLError) as exc:
            raise CheckFailure(f'无法连接 {path}，请检查监听端口、代理与证书。') from exc
    content,_=request('/')
    page=Page();page.feed(content.decode('utf-8','replace'))
    if not page.root or not page.modules:
        raise CheckFailure('首页仍是旧版或静态页面。请构建 frontend/dist，并让网站代理到运行当前 server.py 的进程，不能直接返回仓库根目录的旧 index.html。')
    if expected_modules is not None and page.modules != expected_modules:
        raise CheckFailure('网站入口与本次本地构建不一致，请检查代理指向、部署目录或 CDN 缓存。')
    for asset in set(page.assets):
        content,kind=request(asset)
        path=urllib.parse.urlsplit(asset).path
        if not content or path.endswith('.js') and kind not in ('text/javascript','application/javascript') or path.endswith('.css') and kind!='text/css':
            raise CheckFailure(f'构建资源 {asset} 的内容或类型错误，请完整部署同一次构建。')
    def json_request(path,data=None):
        content,_=request(path,data)
        try:value=json.loads(content)
        except (ValueError,UnicodeError) as exc:raise CheckFailure(f'{path} 未返回 JSON，请检查 API 是否被静态首页或代理错误页替代。') from exc
        if not isinstance(value,dict):raise CheckFailure(f'{path} 未返回有效 JSON 对象。')
        return value
    if json_request('/api/health').get('status')!='ok':raise CheckFailure('应用健康检查未通过。')
    # Synthetic due-date data only; this endpoint computes a preview and never
    # creates an account, saved report, payment or order.
    result=json_request('/api/analyze',{'algorithm':'literary_v3','surname':'林','mode':'due_date','dueDate':'2099-01-01','dueTime':'12:00','place':'杭州','gender':'unknown','length':2,'candidateCount':3})
    analysis=result.get('analysis')
    chart=analysis.get('bazi') if isinstance(analysis,dict) else None
    candidates=result.get('candidates')
    if not isinstance(chart,dict) or not isinstance(chart.get('pillars'),list) or len(chart['pillars'])!=4 or not isinstance(candidates,list) or len(candidates)!=3 or any(not isinstance(item,dict) or not isinstance(item.get('given'),str) or len(item['given'])!=2 for item in candidates):
        raise CheckFailure('起名接口未返回完整四柱和所选字数的 3 个候选，请确认前后端来自同一提交。')
    if analysis.get('algorithm')!='literary_v3' or analysis.get('ranking_version')!='literary-match-v3':
        raise CheckFailure('古籍取名v3算法尚未加载，请更新服务和参考资料库。')
    if analysis.get('workflow',{}).get('id')!='newborn_due_date' or chart.get('reference') is not True:
        raise CheckFailure('预产期场景标识或时间依据错误，请更新后端服务。')
    # Also exercise the born and rename paths; no reports are persisted.
    born={'algorithm':'literary_v3','purpose':'newborn','mode':'born','surname':'李','birthDate':'1998-08-13','birthTime':'13:48','place':'河南南阳'}
    actual=json_request('/api/analyze',born)
    if actual.get('analysis',{}).get('workflow',{}).get('id')!='newborn_born' or actual.get('analysis',{}).get('bazi',{}).get('reference') is not False:
        raise CheckFailure('已出生场景标识或时间依据错误。')
    original=json_request('/api/name-review',{**born,'purpose':'rename','currentName':'李景和'})
    review=original.get('analysis',{})
    if review.get('workflow',{}).get('id')!='rename' or review.get('phase')!='name_review' or review.get('name_review',{}).get('full_name')!='李景和' or original.get('candidates')!=[]:
        raise CheckFailure('改名现名分析接口未完整部署，请更新服务与代理路由。')
    if review.get('algorithm')!='literary_v3':
        raise CheckFailure('改名接口尚未加载古籍取名v3算法。')
    corpus=json_request('/api/naming-corpus')
    if corpus.get('character_records')!=3636 or not corpus.get('selected_phrases'):
        raise CheckFailure('古籍参考资料库未完整导入。')
    return {'module':page.modules[0],'asset_count':len(set(page.assets)),'candidate_count':len(candidates),'workflows_checked':3}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:4173')
    args=parser.parse_args()
    try:
        built=Path(__file__).resolve().parent.parent/'frontend'/'dist'/'index.html'
        if not built.is_file():raise CheckFailure('未找到本地前端构建，请先执行 npm ci --prefix frontend 和 npm run build --prefix frontend。')
        expected=Page();expected.feed(built.read_text(encoding='utf-8'))
        if not expected.modules:raise CheckFailure('本地构建缺少 React 模块入口，请重新构建。')
        result=check_site(args.url,expected_modules=expected.modules)
    except CheckFailure as exc:
        print('自检失败：'+str(exc));return 1
    print('自检通过：React 首页、构建资源、预产期、已出生与改名现名分析三条流程均正常。')
    print('当前入口：'+result['module'])
    print(f"已核对 {result['asset_count']} 个资源，实际生成 {result['candidate_count']} 个候选。")
    return 0


if __name__=='__main__':raise SystemExit(main())
