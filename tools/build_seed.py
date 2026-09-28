# -*- coding: utf-8 -*-
"""ساخت فایل‌های SQL و JS اولیه. اجرا: python3 tools/build_seed.py"""
import json, re, sys, os, glob
sys.path.insert(0, os.path.dirname(__file__))
from seed_content_tests import *
from seed_content_data import *
import seed_content_more as _more
_more.apply(sys.modules['seed_content_data'], sys.modules['seed_content_tests'])
_errs,_om,_oj = _more.validate(sys.modules['seed_content_data'], sys.modules['seed_content_tests'])
assert not _errs and not _om and not _oj, (_errs[:10], _om, _oj)
ROOT = os.path.join(os.path.dirname(__file__), '..')

def q(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return '1' if v else '0'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def ins(table, cols, rows, chunk=25):
    out = []
    for i in range(0, len(rows), chunk):
        part = rows[i:i+chunk]
        vals = ",\n".join("(" + ",".join(q(x) for x in r) + ")" for r in part)
        out.append(f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) VALUES\n{vals};")
    return out

S = []
S += ins('roles', ['id','code','title','permissions'], [
 (1,'admin','مدیر کل','["*"]'),(2,'editor','ویراستار محتوا','["content"]'),(3,'student','دانش‌آموز','[]'),
 (4,'counselor','مشاور','["provider"]'),(5,'professional','متخصص شغل','["provider"]'),(6,'mentor','منتور','["provider"]'),(7,'coach','کوچ','["provider"]')])
S += ins('site_settings', ['setting_key','setting_value','group_name','label','is_public'], SETTINGS)
S += ins('payment_settings', ['id','card_number','card_owner','bank_name','instructions','rules','min_amount','max_amount','receipt_required'],
 [(1,'0000000000000000','نام صاحب کارت را از پنل مدیر وارد کنید','','مبلغ را کارت‌به‌کارت واریز کن، سپس شماره‌ی پیگیری را در همین صفحه ثبت کن. پس از بررسی، درخواست تو فعال می‌شود.','درخواست پس از تأیید پرداخت و هماهنگی زمان قطعی می‌شود. لغو پس از تأیید با هماهنگی پشتیبانی انجام می‌شود.',10000,100000000,0)])
S += ins('ai_settings', ['id','is_enabled','provider_name','base_url','model','system_prompt','temperature','max_tokens','daily_limit'],
 [(1,0,'OpenAI-compatible','https://api.openai.com/v1','','تو «مشاور AI رایگان» پلتفرم «مسیر من» هستی. به زبان فارسی، ساده، محترمانه و کوتاه پاسخ بده. فقط راهنمایی بده و تصمیم نهایی را به کاربر و خانواده بسپار. تشخیص پزشکی یا روان‌شناختی نده. اگر اطلاعات کافی نداری صادقانه بگو و کاربر را به بخش‌های مرتبط سایت یا متخصص ارجاع بده. از داده‌های ساختاریافته‌ی پلتفرم که در ادامه می‌آید به‌عنوان منبع اصلی استفاده کن.',0.4,700,20)])

# تست‌ها
qid = 0; oid = 0; tcat_id = 0
tests_rows=[]; cat_rows=[]; q_rows=[]; o_rows=[]
for (tid,slug,title,desc,kind,minutes,level,sci,resn,cats,qs,scale) in TESTS:
    tests_rows.append((tid,slug,title,desc,kind,minutes,level,sci,resn,1,tid))
    for i,c in enumerate(cats):
        tcat_id += 1
        cat_rows.append((tcat_id,tid,c['code'],c['title'],c['desc'],c['majors'],c['jobs'],c['skills'],c['next'],i+1))
    if kind == 'ability':
        for i,(cc,text,opts,ok) in enumerate(apt_items):
            qid += 1
            q_rows.append((qid,tid,cc,text,'متوسط',1,i+1,1))
            for j,o in enumerate(opts):
                oid += 1; o_rows.append((oid,qid,o,1 if j==ok else 0,j+1))
    else:
        for i,(cc,text,rev) in enumerate(qs):
            qid += 1
            q_rows.append((qid,tid,cc,text,'',1,i+1,1))
            for j,o in enumerate(scale):
                oid += 1; o_rows.append((oid,qid,o,(len(scale)-1-j) if rev else j,j+1))
S += ins('tests',['id','slug','title','description','kind','est_minutes','level','science_note','result_note','is_published','sort_order'],tests_rows,4)
S += ins('test_categories',['id','test_id','code','title','description','suggested_majors','suggested_jobs','suggested_skills','next_action','sort_order'],cat_rows,10)
S += ins('questions',['id','test_id','category_code','q_text','level','weight','sort_order','is_active'],q_rows,40)
S += ins('options',['id','question_id','o_text','score','sort_order'],o_rows,60)

mc=['slug','name','description','suitable_for','key_lessons','abilities','skills','universities','study_path','related_jobs','job_market','future_skills','pros','challenges','faq','similar_majors','holland_codes','konkur_group','is_published','sort_order']
S += ins('majors',['id']+mc,[(i+1,)+tuple(m[k] for k in mc[:-2])+(1,i+1) for i,m in enumerate(MAJORS)],4)
jc=['slug','name','intro','duties','skills','related_majors','entry_path','education','essential_skills','tools','work_env','growth_path','faq','related_experts','holland_codes']
S += ins('jobs',['id']+jc+['is_published','sort_order'],[(i+1,)+tuple(j[k] for k in jc)+(1,i+1) for i,j in enumerate(JOBS)],4)
S += ins('skills',['id','slug','name','description','category','level','how_to_learn','is_published','sort_order'],[(i+1,)+s+(1,i+1) for i,s in enumerate(SKILLS)],13)
S += ins('lessons',['id','slug','name','grade','field_name','description','is_published','sort_order'],[(i+1,s,n,g,f,'',1,i+1) for i,(s,n,g,f) in enumerate(LESSONS)],14)
S += ins('resources',['id','title','author','publisher','category','level','description','image_url','link_url','is_published','sort_order'],[(i+1,t,a,p,c,l,d,'','',1,i+1) for i,(t,a,p,c,l,d) in enumerate(RESOURCES)],10)
S += ins('articles',['id','slug','title','category','summary','body','image_url','author','is_published','published_at'],[(i+1,s,t,c,sm,b,'','تیم مسیر من',1,'2025-01-01') for i,(s,t,c,sm,b) in enumerate(ARTICLES)],5)

pc=['provider_type','name','specialty','experience','city','description','coaching_model','coach_types','tags','price','duration_min']
prov_rows=[]; mode_rows=[]; avail_rows=[]; mid=0; aid=0
for i,p in enumerate(PROVIDERS):
    pid=i+1
    prov_rows.append((pid,None,p[0],p[1],'',p[2],p[3],p[4],p[5],p[6],p[7],'','',p[8],p[9],p[10],'approved'))
    for m in p[11]:
        mid+=1; mode_rows.append((mid,pid,m,1))
    for wd in (6,1,3):
        aid+=1; avail_rows.append((aid,pid,wd,'16:00','19:00',p[10]))
S += ins('providers',['id','user_id','provider_type','name','photo_url','specialty','experience','city','description','coaching_model','coach_types','background','documents_note','tags','price','duration_min','status'],prov_rows,4)
S += ins('provider_modes',['id','provider_id','mode','is_enabled'],mode_rows,30)
S += ins('coach_availability',['id','provider_id','weekday','start_time','end_time','slot_minutes'],avail_rows,40)
S += ins('coaching_packages',['id','coach_type','title','description','sessions_count','weeks','price','is_active'],[
 (1,'goal','بسته‌ی کوچ هدف (۸ هفته)','۴ جلسه‌ی کوچینگ + پیگیری هفتگی',4,8,900000,1),
 (2,'study','بسته‌ی کوچ تحصیلی (۸ هفته)','۴ جلسه + پیگیری روزانه‌ی برنامه',4,8,900000,1),
 (3,'career','بسته‌ی کوچ مسیر شغلی (۸ هفته)','۴ جلسه + نقشه‌ی یادگیری مهارت',4,8,1100000,1),
 (4,'path','بسته‌ی کوچ مسیر (۸ هفته)','همراهی چندمرحله‌ای با ۴ جلسه',4,8,1200000,1)],4)
S += ins('group_coaching_programs',['id','title','description','coach_id','capacity','weeks','price','sessions_desc','actions_desc','rules','start_date','end_date','status'],[
 (1,'مسیر برنامه‌نویسی در ۳۰ روز','گروه ۱۰ نفره برای شروع برنامه‌نویسی با پروژه‌ی کوچک.',4,10,4,300000,'هفته‌ای یک جلسه‌ی گروهی','روزانه ۳۰ دقیقه تمرین و ثبت گزارش','ثبت گزارش روزانه و حضور در جلسه‌ها','','', 'open'),
 (2,'چالش ۳۰ روز مطالعه','گروه پیگیری مطالعه‌ی روزانه با شمارش پیشرفت.',5,10,4,250000,'هفته‌ای یک جلسه‌ی گروهی','مطالعه‌ی روزانه طبق برنامه','ثبت گزارش روزانه','','', 'open')],2)
S += ins('faqs',['id','category','question','answer','sort_order','is_active'],[(i+1,)+f+(i+1,1) for i,f in enumerate(FAQS)],5)
ph="data:image/svg+xml;utf8,"+"%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='400'%3E%3Crect width='100%25' height='100%25' fill='%23e8f0ff'/%3E%3Ctext x='50%25' y='50%25' font-size='42' text-anchor='middle' fill='%232b4c9b' font-family='Tahoma'%3E%D8%AC%D8%A7%DB%8C %D8%AA%D8%A8%D9%84%DB%8C%D8%BA %D8%B4%D9%85%D8%A7%3C/text%3E%3C/svg%3E"
S += ins('banners',['id','placement','title','media_type','media_url','poster_url','link_url','is_active','sort_order'],[(1,'home_ad','جای تبلیغ (نمونه)','image',ph,'','',0,1)],1)
S += ins('career_paths',['id','slug','title','description','holland_codes','majors','jobs','steps','is_published','sort_order'],[(i+1,)+c+(1,i+1) for i,c in enumerate(CAREER_PATHS)],3)
S += ins('smart_suggestions',['id','trigger_type','trigger_value','title','description','link','sort_order','is_active'],[(i+1,)+s+(i+1,1) for i,s in enumerate(SUGGESTIONS)],11)

# --- خروجی‌ها ---
schema_sql=open(os.path.join(ROOT,'worker/migrations/0001_schema.sql'),encoding='utf-8').read()
body=re.sub(r'(?m)^--.*$','',schema_sql)
schema_stmts=[s.strip()+';' for s in re.split(r';\s*\n',body) if s.strip()]
# --- خروجی SQL به چند فایل کوچک (هر کدام حداکثر ~110KB) تا در کنسول D1 و wrangler بدون خطا اجرا شود ---
for _f in glob.glob(os.path.join(ROOT,'worker/migrations/00[0-9][0-9]_seed_*.sql')): os.remove(_f)
_parts=[]; _cur=[]; _size=0
for _st in S:
    _n=len(_st.encode())
    if _cur and _size+_n>110000: _parts.append(_cur); _cur=[]; _size=0
    _cur.append(_st); _size+=_n
if _cur: _parts.append(_cur)
for _i,_p in enumerate(_parts):
    open(os.path.join(ROOT,f'worker/migrations/{_i+2:04d}_seed_part{_i+1}.sql'),'w',encoding='utf-8').write("-- seed data (auto-generated by tools/build_seed.py) - all rows editable from admin panel\n"+"\n".join(_p)+"\n")
print(len(_parts),'seed files')
def js(name,arr):
    open(os.path.join(ROOT,f'worker/src/sql/{name}.js'),'w',encoding='utf-8').write("// فایل خودکار - با tools/build_seed.py ساخته شده است\nexport default "+json.dumps(arr,ensure_ascii=False)+";\n")
js('schema',schema_stmts); js('seed',S)
print(len(schema_stmts),'schema stmts,',len(S),'seed stmts,',len(q_rows),'questions,',len(o_rows),'options')
