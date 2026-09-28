# -*- coding: utf-8 -*-
"""گسترش داده‌ی پایه: فهرست کامل رشته‌ها، مشاغل، مهارت‌ها، دروس، فهرست‌های انتخابی و نگاشت تست‌ها.
با apply(d, tests) از build_seed.py فراخوانی می‌شود و لیست‌های موجود را درجا گسترش می‌دهد."""
import json
from seed_majors_a import MAJORS_A
from seed_majors_b import MAJORS_B
from seed_majors_c import MAJORS_C
from seed_jobs_a import JOBS_A
from seed_jobs_b import JOBS_B
from seed_jobs_c import JOBS_C

SANJESH = "گروه آزمایشی، ضرایب و ظرفیت هر سال را از دفترچه‌ی رسمی سازمان سنجش آموزش کشور بررسی کن."
KIND = {
 'E': dict(group='ریاضی', uni='دانشگاه‌های دولتی، آزاد و غیرانتفاعی متعدد. ', path='کارشناسی ۴ ساله، ارشد ۲ ساله، دکتری؛ کارآموزی و پروژه از میانه‌ی دوره ورود به بازار را هموارتر می‌کند.',
   pros='پایه‌ی علمی قوی، مهارت‌های قابل انتقال، امکان ادامه‌ی تحصیل و کار در زمینه‌های متنوع', chal='بار درسی و ریاضی سنگین، رقابت، نیاز به مهارت عملی و زبان انگلیسی'),
 'S': dict(group='ریاضی', uni='دانشگاه‌های دولتی و برخی دانشگاه‌های دیگر. ', path='کارشناسی ۴ ساله، ارشد ۲ ساله، دکتری؛ برای پژوهش و تدریس ادامه‌ی تحصیل رایج است.',
   pros='پایه‌ی نظری محکم، مسیر پژوهش و تدریس، ترکیب‌پذیری با فناوری و داده', chal='مسیر شغلی مستقیم کمتر مشخص است؛ معمولاً به ادامه‌ی تحصیل یا مهارت تکمیلی (برنامه‌نویسی) نیاز دارد'),
 'H': dict(group='تجربی', uni='دانشگاه‌های علوم پزشکی و برخی دانشگاه‌های دیگر. ', path='کارشناسی ۴ ساله؛ ارشد و دکتری تخصصی در بسیاری از رشته‌ها؛ برخی مسیرها به کارورزی بالینی و مجوز حرفه‌ای نیاز دارند.',
   pros='ارتباط مستقیم با سلامت و کمک به دیگران، نیاز پایدار جامعه، مسیر ادامه‌ی تحصیل روشن', chal='بار درسی و کارورزی سنگین، شیفت‌کاری و فشار روانی در برخی رشته‌ها، نیاز به مجوز و صلاحیت حرفه‌ای'),
 'P': dict(group='تجربی', uni='دانشگاه‌های علوم پزشکی؛ پذیرش بسیار رقابتی و ظرفیت محدود. ', path='دکترای حرفه‌ای (حدود ۶ سال)؛ سپس امکان تخصص یا پژوهش؛ مسیر طولانی و پرهزینه از نظر زمان و انرژی.',
   pros='جایگاه حرفه‌ای مشخص، نیاز پایدار جامعه، امکان تخصص و پژوهش', chal='ورود رقابتی، دوره‌ی تحصیل طولانی و سنگین، مسئولیت حرفه‌ای بالا'),
 'A': dict(group='تجربی', uni='دانشگاه‌های دولتی و کشاورزی و منابع طبیعی. ', path='کارشناسی ۴ ساله، ارشد ۲ ساله، دکتری؛ کارآموزی در مزرعه یا مرکز تحقیقاتی اهمیت زیادی دارد.',
   pros='ارتباط با طبیعت، اهمیت راهبردی غذا و منابع، امکان کسب‌وکار مستقل', chal='کار میدانی و فصلی، درآمد وابسته به شرایط بازار و منطقه، نیاز به سرمایه در کسب‌وکار شخصی'),
 'U': dict(group='انسانی', uni='دانشگاه‌های دولتی، آزاد و غیرانتفاعی متعدد. ', path='کارشناسی ۴ ساله، ارشد ۲ ساله، دکتری؛ مهارت‌های تکمیلی (زبان، داده، نگارش) ارزش بازار را بالا می‌برند.',
   pros='تنوع مسیر، ترکیب‌پذیری با مهارت‌های دیگر، پرورش تفکر انتقادی و ارتباط', chal='مسیر شغلی گاهی مبهم است؛ نیاز به مهارت تکمیلی و شبکه‌ی ارتباطی'),
 'L': dict(group='زبان', uni='دانشگاه‌های دولتی و آزاد. ', path='کارشناسی ۴ ساله، ارشد ۲ ساله، دکتری؛ گواهی‌های بین‌المللی زبان مزیت مهمی هستند.',
   pros='مهارت قابل استفاده در داخل و خارج، امکان کار مستقل و دورکاری، مسیر مهاجرت تحصیلی', chal='ترجمه‌ی ماشینی بازار را تغییر داده؛ نیاز به تخصص موضوعی و ادامه‌ی تمرین زبان'),
 'R': dict(group='هنر', uni='دانشگاه‌های هنر و دانشگاه‌های دولتی و آزاد؛ معمولاً همراه با آزمون عملی. ', path='کارشناسی ۴ ساله؛ ارشد و دکتری در برخی گرایش‌ها؛ نمونه‌کار مهم‌تر از مدرک است.',
   pros='امکان بروز خلاقیت، کار مستقل و فریلنس، کاربرد در صنایع خلاق', chal='درآمد ناپایدار در ابتدا، رقابت، نیاز به نمونه‌کار و بازاریابی شخصی'),
 'T': dict(group='فرهنگیان', uni='دانشگاه فرهنگیان و دانشگاه‌های تربیت‌معلم؛ پذیرش با شرایط ویژه. ', path='کارشناسی ۴ ساله معمولاً از مسیر دانشگاه فرهنگیان؛ شرایط پذیرش و جذب را از منابع رسمی بررسی کن.',
   pros='مسیر شغلی روشن، تأثیر اجتماعی، ثبات در صورت جذب', chal='جذب به سیاست‌ها و نیاز نظام آموزشی بستگی دارد؛ فشار کاری و مسئولیت تربیتی بالاست'),
 'V': dict(group='فنی‌وحرفه‌ای', uni='مراکز فنی‌وحرفه‌ای، دانشگاه فنی‌وحرفه‌ای و مؤسسات کاردانی. ', path='کاردانی (حدود ۲ سال) یا دوره‌های مهارتی و گواهی‌نامه؛ امکان ادامه‌ی تحصیل تا کارشناسی وجود دارد.',
   pros='ورود سریع‌تر به بازار کار، مهارت عملی، امکان راه‌اندازی کارگاه یا کسب‌وکار', chal='ارتقای شغلی وابسته به مهارت و گواهی‌های تکمیلی؛ کار فیزیکی و ایمنی مهم است'),
}
ABIL = {'R':'مهارت عملی، دقت فنی، تحمل کار میدانی','I':'تفکر تحلیلی، کنجکاوی علمی، دقت','A':'خلاقیت، نگاه بصری یا زبانی، ابراز خود','S':'همدلی، ارتباط مؤثر، صبر','E':'رهبری، مذاکره، تصمیم‌گیری','C':'نظم، دقت، پایبندی به روش'}
JOBKIND = {
 'T': ('کارشناسی مرتبط یا یادگیری مستقل همراه با نمونه‌کار','یادگیری مهارت‌های پایه، ساخت پروژه‌ی واقعی، کارآموزی یا فریلنس','دفتر یا دورکاری','کارآموز، کارشناس، ارشد، سرپرست فنی یا مدیر محصول'),
 'N': ('کارشناسی مهندسی مرتبط؛ ارشد برای مسیرهای تخصصی‌تر','کارآموزی صنعتی، پروژه‌ی دانشگاهی، تسلط بر نرم‌افزارهای تخصصی، عضویت در نظام مهندسی در صورت نیاز','دفتر فنی، کارخانه، کارگاه یا پروژه‌ی میدانی','کارشناس، مهندس ارشد، سرپرست پروژه، مدیر فنی'),
 'M': ('مدرک مرتبط با رشته‌ی سلامت و دریافت مجوز فعالیت حرفه‌ای','گذراندن دوره‌ی تحصیلی، کارورزی بالینی، دریافت مجوز فعالیت','بیمارستان، کلینیک یا مرکز درمانی','کارشناس، کارشناس ارشد، سرپرست بخش، مدیر یا پژوهشگر'),
 'Sc': ('کارشناسی مرتبط؛ ارشد و دکتری برای مسیرهای پژوهشی','تجربه‌ی آزمایشگاهی یا تحلیلی، پروژه‌ی پژوهشی، گزارش یا مقاله','آزمایشگاه، مرکز پژوهشی یا دانشگاه','دستیار پژوهشی، پژوهشگر، پژوهشگر ارشد، مدیر پژوهش'),
 'B': ('کارشناسی مرتبط؛ گواهی‌های حرفه‌ای مزیت است','کارآموزی، یادگیری نرم‌افزارهای تخصصی، دریافت گواهی‌های حرفه‌ای','دفتر، بانک یا شرکت','کارشناس، کارشناس ارشد، سرپرست، مدیر'),
 'S': ('مدرک مرتبط؛ برای برخی مسیرها گذراندن آزمون یا دریافت مجوز','تجربه‌ی عملی، نمونه‌کار، کارورزی یا دستیاری','مدرسه، مرکز مشاوره، سازمان یا مؤسسه','کارشناس، مدرس یا مشاور ارشد، مدیر آموزشی یا پژوهشگر'),
 'L': ('مدرک مرتبط و گذراندن مراحل ویژه‌ی صلاحیت یا آزمون‌های ورود','کارآموزی، آزمون‌ها یا گزینش‌های مربوط','دفتر، دادگستری، سازمان یا نهاد','کارشناس، کارشناس ارشد، سرپرست، مدیر'),
 'A': ('مدرک هنری یا یادگیری مستقل همراه با نمونه‌کار قوی','ساخت نمونه‌کار، شرکت در پروژه‌ها، شبکه‌سازی با فعالان حوزه','استودیو، کارگاه، محیط پروژه یا فریلنس','دستیار، هنرمند یا طراح مستقل، مدیر هنری یا مدرس'),
 'G': ('کارشناسی کشاورزی، منابع طبیعی یا صنایع غذایی مرتبط','کارآموزی در مزرعه، کارخانه یا مرکز تحقیقاتی؛ دوره‌های تخصصی','مزرعه، گلخانه، آزمایشگاه یا سازمان اجرایی','کارشناس، کارشناس ارشد، مدیر فنی یا مشاور'),
 'K': ('دوره‌های فنی‌وحرفه‌ای یا کاردانی','شاگردی نزد استادکار، دوره‌ی مهارتی، گرفتن گواهی‌نامه‌ی فنی','کارگاه، پروژه یا محل مشتری','شاگرد، تکنسین ماهر، استادکار، صاحب کارگاه'),
 'W': ('مدرک مرتبط و مدرک مربیگری معتبر','سابقه‌ی ورزشی، دوره‌های مربیگری، کارورزی','باشگاه، سالن ورزشی، مدرسه یا مرکز سلامت','دستیار مربی، مربی، سرمربی یا مدیر مجموعه'),
}
def _csv(s): return [x for x in (s or '').split(',') if x]
def _join(a): return ','.join(dict.fromkeys(a))

EXTRA_SKILLS = [
 ('public-speaking','سخنوری و ارائه','بیان روشن و مؤثر ایده‌ها برای جمع.','ارتباطی','پایه','ارائه‌ی کوتاه جلوی دوستان و ضبط و بازبینی ویدئوی خودت'),
 ('writing','نگارش','بیان مکتوب دقیق و روان.','ارتباطی','پایه','نوشتن منظم، دریافت بازخورد و ویرایش دوباره'),
 ('active-listening','گوش دادن فعال','شنیدن دقیق و درک نیاز طرف مقابل.','ارتباطی','پایه','تمرین بازگو کردن حرف دیگران با کلمات خودت'),
 ('negotiation','مذاکره','رسیدن به توافق برد-برد.','ارتباطی','میانی','شبیه‌سازی موقعیت‌های مذاکره و بازخورد گرفتن'),
 ('research-methods','روش پژوهش','طرح پرسش، جمع‌آوری و تحلیل شواهد.','شناختی','میانی','خواندن مقالات ساده و طراحی یک پژوهش کوچک'),
 ('numeracy','سواد عددی','درک و استفاده از اعداد، درصد و نمودار.','شناختی','پایه','تمرین با داده‌های واقعی روزمره'),
 ('financial-literacy','سواد مالی','مدیریت پول، بودجه و درک ریسک.','مالی','پایه','ثبت درآمد و هزینه و مطالعه‌ی منابع معتبر'),
 ('excel-skills','اکسل و صفحه‌گسترده','سازماندهی و تحلیل داده در صفحه‌گسترده.','فناوری','پایه','حل مسائل واقعی مثل بودجه‌ی شخصی با اکسل'),
 ('sql-basics','مبانی پایگاه داده و SQL','پرس‌وجو و مدیریت داده‌ی ساختاریافته.','فناوری','میانی','دوره‌ی مقدماتی و تمرین با یک پایگاه‌داده‌ی نمونه'),
 ('ai-literacy','سواد هوش مصنوعی','شناخت توان و محدودیت ابزارهای هوش مصنوعی و استفاده‌ی مسئولانه.','فناوری','پایه','کار با ابزارها و بررسی درستی خروجی‌ها'),
 ('cyber-hygiene','امنیت دیجیتال فردی','محافظت از حساب‌ها و داده‌های شخصی.','فناوری','پایه','رمز قوی، تأیید دومرحله‌ای و آشنایی با کلاهبرداری‌های رایج'),
 ('project-management','مدیریت پروژه','برنامه‌ریزی، زمان‌بندی و پیگیری کار تیمی.','مدیریتی','میانی','مدیریت یک پروژه‌ی کوچک مدرسه‌ای یا شخصی'),
 ('design-thinking','تفکر طراحی','حل مسئله با تمرکز بر نیاز کاربر و نمونه‌سازی سریع.','خلاقیت','میانی','ساخت نمونه‌ی ساده و گرفتن بازخورد از کاربر'),
 ('visual-tools','ابزارهای طراحی بصری','کار با نرم‌افزارهای طراحی و ویرایش تصویر.','فناوری','پایه','ساخت پوستر یا محتوای ساده با ابزارهای رایگان'),
 ('storytelling','روایت‌گری','ساختن داستان مؤثر برای انتقال پیام.','خلاقیت','پایه','نوشتن و تعریف داستان کوتاه و دریافت بازخورد'),
 ('second-language','یادگیری زبان دوم','یادگیری منظم یک زبان خارجه غیر از انگلیسی.','ارتباطی','میانی','تمرین روزانه‌ی کوتاه و گفت‌وگو با هم‌زبان‌ها'),
 ('first-aid','کمک‌های اولیه','اقدامات فوری در حوادث و بیماری.','سلامت','پایه','گذراندن دوره‌ی معتبر کمک‌های اولیه'),
 ('lab-skills','مهارت آزمایشگاهی','کار ایمن و دقیق در آزمایشگاه.','علمی','پایه','ثبت دقیق آزمایش، رعایت ایمنی و تکرارپذیری'),
 ('technical-drawing','نقشه‌خوانی و ترسیم فنی','خواندن و ترسیم نقشه‌های فنی.','فنی','پایه','تمرین خواندن نقشه‌ی ساده و ترسیم دستی یا با نرم‌افزار'),
 ('manual-dexterity','مهارت دستی','کار دقیق و ماهرانه با ابزار.','فنی','پایه','تمرین منظم پروژه‌های ساخت و تعمیر'),
 ('stress-management','مدیریت استرس','مقابله‌ی سالم با فشار و اضطراب امتحان.','فردی','پایه','تنفس آرام، خواب منظم، ورزش و برنامه‌ریزی واقع‌بینانه'),
 ('self-directed-learning','یادگیری مستقل','هدف‌گذاری و یادگیری بدون نظارت مداوم.','فردی','پایه','انتخاب هدف کوچک، برنامه‌ی هفتگی و بازبینی نتیجه'),
 ('professional-ethics','اخلاق حرفه‌ای','رعایت صداقت، رازداری و مسئولیت در کار.','فردی','پایه','بررسی نمونه‌های واقعی و گفت‌وگو درباره‌ی دوراهی‌های اخلاقی'),
 ('networking','شبکه‌سازی حرفه‌ای','ایجاد و حفظ ارتباط با افراد حوزه‌ی مورد علاقه.','ارتباطی','میانی','گفت‌وگو با شاغلان و شرکت در رویدادهای تخصصی'),
]
EXTRA_LESSONS = [
 ('discrete-math','ریاضی گسسته','یازدهم و دوازدهم','ریاضی فیزیک'),('algebra-probability','جبر و احتمال','دوازدهم','ریاضی فیزیک'),
 ('geology-lesson','زمین‌شناسی','یازدهم','علوم تجربی'),('literary-arts','علوم و فنون ادبی','دهم تا دوازدهم','علوم انسانی'),
 ('philosophy-lesson','فلسفه','یازدهم و دوازدهم','علوم انسانی'),('history-lesson','تاریخ','دهم تا دوازدهم','علوم انسانی'),
 ('geography-lesson','جغرافیا','دهم تا دوازدهم','علوم انسانی'),('psychology-lesson','روان‌شناسی','یازدهم و دوازدهم','علوم انسانی'),
 ('arabic-special','عربی زبان قرآن (تخصصی)','دهم تا دوازدهم','علوم انسانی'),('islamic-knowledge','علوم و معارف اسلامی','دهم تا دوازدهم','علوم و معارف اسلامی'),
 ('computer-lesson','دانش فنی و مهارت‌های رایانه‌ای','دهم تا دوازدهم','فنی و حرفه‌ای'),('technical-drawing-lesson','نقشه‌کشی فنی','دهم تا دوازدهم','فنی و حرفه‌ای'),
 ('workshop-lesson','کارگاه و آموزش مهارتی','دهم تا دوازدهم','فنی و حرفه‌ای / کاردانش'),('art-lesson','مبانی هنر و طراحی','دهم تا دوازدهم','هنر'),
 ('pe-lesson','تربیت بدنی','دهم تا دوازدهم','همه'),('physics-general','فیزیک عمومی (تجربی)','دهم تا دوازدهم','علوم تجربی'),
 ('math-humanities','ریاضی و آمار (انسانی)','دهم تا دوازدهم','علوم انسانی'),('health-lesson','سلامت و بهداشت','دهم تا دوازدهم','همه'),
]
GRADES = ["هفتم","هشتم","نهم","دهم","یازدهم","دوازدهم","فارغ‌التحصیل دبیرستان (داوطلب کنکور)","دانشجو"]
FIELDS = ["ریاضی و فیزیک","علوم تجربی","علوم انسانی","علوم و معارف اسلامی","فنی‌وحرفه‌ای","کاردانش","هنر","هنوز انتخاب نکرده‌ام"]
CITIES = ["تهران","کرج","مشهد","اصفهان","شیراز","تبریز","قم","اهواز","کرمانشاه","ارومیه","رشت","زاهدان","کرمان","همدان","یزد","اردبیل","بندرعباس","اراک","زنجان","سنندج","قزوین","گرگان","ساری","بجنورد","بیرجند","خرم‌آباد","ایلام","بوشهر","سمنان","شهرکرد","یاسوج","سایر شهرها","خارج از کشور"]
KONKUR_GROUPS = ["ریاضی","تجربی","انسانی","هنر","زبان","فرهنگیان","فنی‌وحرفه‌ای"]

# نگاشت اضافه‌ی تست‌ها: (test_slug, code) -> (majors, jobs)
EXTRA_MAP = {
 ('multiple-intelligences','LING'): ("persian-literature,journalism,english-translation,social-communication,educational-sciences,law","writer,journalist,translator,content-writer,editor-proofreader,foreign-language-teacher"),
 ('multiple-intelligences','LOGI'): ("mathematics,statistics,computer-science,artificial-intelligence,physics,actuarial-science","data-scientist,statistician,mathematician,machine-learning-engineer,actuary"),
 ('multiple-intelligences','SPAT'): ("architecture,industrial-design,graphic-design,animation,interior-architecture,surveying-engineering,landscape-architecture","industrial-designer,animator,interior-designer,gis-specialist,photographer"),
 ('multiple-intelligences','BODY'): ("physical-education,physiotherapy,occupational-therapy,sculpture,theatre,handicrafts","sports-coach,physiotherapist,fitness-trainer,exercise-physiologist,handicraft-artist"),
 ('multiple-intelligences','MUSI'): ("music,theatre,cinema","musician,music-teacher,video-editor,filmmaker"),
 ('multiple-intelligences','INTER'): ("counseling,psychology,social-work,educational-sciences,nursing,public-health,early-childhood-education","counselor,social-worker,nurse,teacher,hr-specialist,health-educator"),
 ('multiple-intelligences','INTRA'): ("philosophy,psychology,counseling,islamic-theology,art-research","writer,researcher,counselor,university-lecturer"),
 ('multiple-intelligences','NATU'): ("biology,natural-resources,agricultural-engineering,geology,environmental-engineering,veterinary-medicine,horticulture","natural-resources-expert,agricultural-engineer,veterinarian,geologist,environmental-engineer"),
 ('aptitude-basic','NUM'): ("statistics,accounting,actuarial-science,mathematics","statistician,accountant,actuary,financial-analyst"),
 ('aptitude-basic','VER'): ("persian-literature,journalism,english-translation,political-science","writer,journalist,translator,content-writer"),
 ('aptitude-basic','LOG'): ("computer-science,mathematics,artificial-intelligence,philosophy","data-scientist,machine-learning-engineer,mathematician,cybersecurity-analyst"),
 ('aptitude-basic','SPA'): ("industrial-design,surveying-engineering,interior-architecture,urban-planning","industrial-designer,surveyor,interior-designer,urban-planner"),
 ('big-five-mini','O'): ("painting,philosophy,art-research,cinema","painter,writer,filmmaker,researcher"),
 ('big-five-mini','C'): ("accounting,industrial-engineering,pharmacy","accountant,auditor,pharmacist,quality-control-engineer"),
 ('big-five-mini','A'): ("counseling,social-work,nursing,occupational-therapy","counselor,social-worker,nurse,occupational-therapist"),
 ('big-five-mini','E'): ("marketing-management,political-science,sports-management","marketing-manager,sales-manager,diplomat,entrepreneur"),
 ('work-values','ACH'): ("","researcher,data-scientist,project-manager,physician,entrepreneur"),
 ('work-values','IND'): ("","entrepreneur,writer,painter,web-developer,photographer"),
 ('work-values','REC'): ("","lawyer,physician,university-lecturer,journalist,filmmaker,architect"),
 ('work-values','REL'): ("","teacher,counselor,nurse,social-worker,hr-specialist,physiotherapist"),
 ('work-values','SUP'): ("","accountant,public-administrator,teacher,nurse,librarian,banking-specialist"),
 ('work-values','WC'): ("","financial-analyst,dentist,pharmacist,software-developer,accountant,it-support-specialist"),
}

def _major(t):
    slug, kind, name, hol, desc, suit, lessons, skills, market, future, jobs, similar = t[:12]
    k = KIND[kind]; group = t[12] if len(t) > 12 else k['group']
    first = hol.split(',')[0]
    return dict(slug=slug, name=name, description=desc, suitable_for=suit, key_lessons=lessons, abilities=ABIL.get(first, ABIL['I']), skills=skills,
        universities=k['uni'] + SANJESH, study_path=k['path'], related_jobs=jobs, job_market=market + ' (این متن کلی است؛ وضعیت بازار کار در هر سال و منطقه تغییر می‌کند.)',
        future_skills=future, pros=k['pros'], challenges=k['chal'], faq='', similar_majors=similar, holland_codes=hol, konkur_group=group)

def _job(t):
    slug, cat, name, intro, duties, skills, tools, majors, hol = t
    edu, entry, env, growth = JOBKIND[cat]
    return dict(slug=slug, name=name, intro=intro, duties=duties, skills=skills, related_majors=majors, entry_path=entry, education=edu,
        essential_skills=skills, tools=tools, work_env=env, growth_path=growth, faq='', related_experts='شاغلان و متخصصان حوزه‌ی ' + name, holland_codes=hol)

def apply(d, tests):
    """d = ماژول seed_content_data ، tests = ماژول seed_content_tests"""
    M = {m['slug']: m for m in d.MAJORS}; J = {j['slug']: j for j in d.JOBS}
    for t in MAJORS_A + MAJORS_B + MAJORS_C:
        if t[0] not in M: M[t[0]] = _major(t)
    for t in JOBS_A + JOBS_B + JOBS_C:
        if t[0] in J:   # شغل موجود: فقط رشته‌های مرتبط را ادغام کن
            J[t[0]]['related_majors'] = _join(_csv(J[t[0]]['related_majors']) + _csv(t[7]))
        else: J[t[0]] = _job(t)
    # تقارن پیوندها
    for m in M.values():
        for js in _csv(m['related_jobs']):
            if js in J: J[js]['related_majors'] = _join(_csv(J[js]['related_majors']) + [m['slug']])
    for j in J.values():
        for ms in _csv(j['related_majors']):
            if ms in M: M[ms]['related_jobs'] = _join(_csv(M[ms]['related_jobs']) + [j['slug']])
    # FAQ خودکار و بدون ادعای اضافه
    for m in M.values():
        if not m['faq']:
            names = [J[x]['name'] for x in _csv(m['related_jobs'])[:4] if x in J]
            m['faq'] = f"این رشته برای چه کسی مناسب است؟ {m['suitable_for']}\nبعد از فارغ‌التحصیلی چه مسیرهایی دارم؟ مسیرهایی مثل {'، '.join(names)}؛ مسیر واقعی به مهارت، ادامه‌ی تحصیل و شرایط بازار بستگی دارد.\nگروه آزمایشی و شرایط ورود چیست؟ {SANJESH}"
    for j in J.values():
        if not j['faq']:
            names = [M[x]['name'] for x in _csv(j['related_majors'])[:4] if x in M]
            j['faq'] = f"برای شروع چه کار کنم؟ {j['entry_path']}\nچه رشته‌هایی به این شغل نزدیک‌ترند؟ {'، '.join(names)}؛ رشته‌های دیگر هم با مهارت و نمونه‌کار می‌توانند وارد این مسیر شوند."
    # درجا جایگزین کن (ترتیب: اولی‌های اصلی، سپس جدیدها)
    d.MAJORS[:] = list(M.values()); d.JOBS[:] = list(J.values())
    have = {s[0] for s in d.SKILLS}; d.SKILLS.extend([s for s in EXTRA_SKILLS if s[0] not in have])
    have = {l[0] for l in d.LESSONS}; d.LESSONS.extend([l for l in EXTRA_LESSONS if l[0] not in have])
    # فهرست‌های انتخابی
    newv = {'grades': GRADES, 'fields': FIELDS, 'cities': CITIES, 'konkur_groups': KONKUR_GROUPS}
    out = []; seen = set()
    for s in d.SETTINGS:
        if s[0] in newv: out.append((s[0], json.dumps(newv[s[0]], ensure_ascii=False)) + tuple(s[2:])); seen.add(s[0])
        else: out.append(s)
    if 'konkur_groups' not in seen: out.append(('konkur_groups', json.dumps(KONKUR_GROUPS, ensure_ascii=False), 'عمومی', 'گروه‌های آزمایشی کنکور (JSON)', 1))
    d.SETTINGS[:] = out
    # نگاشت تست‌ها: هالند از روی کدهای رشته/شغل
    mlist = list(M.values()); jlist = list(J.values())
    for tst in tests.TESTS:
        slug = tst[1]
        for c in tst[9]:
            if slug == 'holland-interest':
                pm = [m['slug'] for m in mlist if m['holland_codes'].split(',')[0] == c['code']]
                pj = [j['slug'] for j in jlist if j['holland_codes'].split(',')[0] == c['code']]
                c['majors'] = _join(_csv(c['majors']) + pm[:14]); c['jobs'] = _join(_csv(c['jobs']) + pj[:14])
            elif (slug, c['code']) in EXTRA_MAP:
                em, ej = EXTRA_MAP[(slug, c['code'])]
                c['majors'] = _join(_csv(c['majors']) + _csv(em)); c['jobs'] = _join(_csv(c['jobs']) + _csv(ej))

def validate(d, tests):
    """اعتبارسنجی همه‌ی ارجاع‌ها؛ در صورت خطا AssertionError"""
    ms = {m['slug'] for m in d.MAJORS}; js = {j['slug'] for j in d.JOBS}; sk = {s[0] for s in d.SKILLS}; errs = []
    assert len(ms) == len(d.MAJORS) and len(js) == len(d.JOBS), 'slug تکراری'
    for m in d.MAJORS:
        errs += [f"major {m['slug']} -> job {x}" for x in _csv(m['related_jobs']) if x not in js]
        errs += [f"major {m['slug']} -> similar {x}" for x in _csv(m['similar_majors']) if x not in ms]
        assert m['description'] and m['holland_codes'] and m['konkur_group'], m['slug']
    for j in d.JOBS:
        errs += [f"job {j['slug']} -> major {x}" for x in _csv(j['related_majors']) if x not in ms]
        assert j['intro'] and j['holland_codes'], j['slug']
    for tst in tests.TESTS:
        for c in tst[9]:
            errs += [f"test {tst[1]}/{c['code']} major {x}" for x in _csv(c['majors']) if x not in ms]
            errs += [f"test {tst[1]}/{c['code']} job {x}" for x in _csv(c['jobs']) if x not in js]
            errs += [f"test {tst[1]}/{c['code']} skill {x}" for x in _csv(c['skills']) if x not in sk]
    orphan_m = [m['slug'] for m in d.MAJORS if not _csv(m['related_jobs'])]; orphan_j = [j['slug'] for j in d.JOBS if not _csv(j['related_majors'])]
    return errs, orphan_m, orphan_j
