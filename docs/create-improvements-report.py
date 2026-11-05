"""Create an editable ODT with real test screenshots; LibreOffice exports it to PDF."""
from html import escape
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "BDS-improvements-guide.odt"
steps = [
    ("01 — بحث عربي أوضح", "البحث يتجاهل التشكيل والتطويل واختلافات الألف، ويدعم أكثر من كلمة. التظليل يعرض النص الأصلي، ولا يغيّر الرسائل أو ملفات الأكواد.", "improvement-1-arabic-search.png"),
    ("02 — فلترة رسائلك وردود المساعد", "اختر الكل أو أنت أو المساعد. الأعداد تعكس نتائج البحث لكل نوع. حفظ الرسائل يصدّر النتائج المطابقة للبحث والفلتر، حتى لو تجاوزت حد العرض.", "improvement-2-assistant-filter.png"),
    ("03 — لوحة الصوت بدون ميكروفون", "افتح الوصول السريع ثم إعدادات الصوت قبل تشغيل Live. اللوحة تجمع لغة استماع Live ومفتاح قراءة الردود. لا خدمة محلية ولا صوت متصفح.", "improvement-3-voice-panel.png"),
    ("04 — صوت DeepSeek هو المسار الوحيد", "قراءة الردود تستخدم صوت DeepSeek الرسمي فقط. زر الاختبار يمشي المسار كاملًا ويسمّي المرحلة التي فشلت (لا محادثة، لا رد محفوظ، رفض تذكرة…) بدل التحوّل الصامت إلى صوت آخر.", "improvement-4-native-probe.png"),
    ("05 — دعم الجوال والخصوصية", "تم التحقق بعرض 390 بكسل دون تمرير أفقي. نسخ التشخيص لا يحتوي على نصوص المحادثة أو تسجيلات صوتية. أثناء نطق الرد يتوقف الميكروفون مؤقتًا ثم يعود الاستماع.", "improvement-5-mobile-voice.png"),
    ("06 — الإنجليزية والوضع الفاتح", "الواجهة تدعم العربية والإنجليزية والاتجاهين والوضع الفاتح والداكن. الصور لواجهات الإضافة الفعلية داخل صفحة اختبار معزولة؛ بيانات المحادثة هنا تجريبية وليست حساب المستخدم.", "improvement-6-english-light.png"),
]
styles = '''<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="145%"/><style:text-properties style:font-name="Arial" fo:font-size="11pt"/></style:default-style></office:styles>
<office:automatic-styles><style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin="1.8cm" style:print-orientation="portrait"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Page"/></office:master-styles></office:document-styles>'''
body = []
for index, (title, description, image) in enumerate(steps):
    heading = "HeadingFirst" if index == 0 else "HeadingPage"
    if index == 0:
        body.append('<text:p text:style-name="Brand">BETTER DEEPSEEK — التحسينات العملية</text:p>')
        body.append('<text:p text:style-name="Body">دليل مصوّر | 4 نوفمبر 2026 | صور فعلية من Chromium لواجهة اختبار معزولة</text:p>')
    body.append(f'<text:p text:style-name="{heading}">{escape(title)}</text:p>')
    body.append(f'<text:p text:style-name="Body">{escape(description)}</text:p>')
    width, height = ("8.3cm", "17.96cm") if image.endswith("mobile-voice.png") else ("17cm", "13.8cm")
    body.append(f'<text:p text:style-name="Image"><draw:frame draw:name="Step{index+1}" text:anchor-type="as-char" svg:width="{width}" svg:height="{height}"><draw:image xlink:href="Pictures/{image}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>')
    body.append(f'<text:p text:style-name="Caption">لقطة {index+1} — واجهة فعلية، بيانات اختبار وليست محادثة المستخدم.</text:p>')
body.append('<text:p text:style-name="HeadingPage">التفعيل والاختبار</text:p>')
for paragraph in [
    "1. أعد تحميل إضافة Better DeepSeek من chrome://extensions أو edge://extensions ثم حدّث صفحة DeepSeek.",
    "2. افتح الوصول السريع أو استخدم Ctrl + Shift + K، ثم اختر إعدادات الصوت. اللوحة تعرض لغة استماع Live ومفتاح «اقرأ كل رد بصوت DeepSeek».",
    "3. صوت DeepSeek هو المسار الوحيد للنطق: لا خدمة محلية ولا صوت متصفح. أثناء قراءة الرد يتوقف الميكروفون مؤقتًا، ثم يعود الاستماع بعد انتهاء الصوت.",
    "4. البحث يطابق الرسائل المحمّلة في الصفحة فقط. لا يرسل نص البحث إلى خدمة خارجية، ولا يغيّر المحتوى المحفوظ أو المنسوخ.",
    "التحقق: اختبارات JavaScript آلية تشمل وحدة صوت DeepSeek وتوقف الميكروفون أثناء النطق، واختبارات واجهة Chromium حقيقية للبحث واللوحة وحفظ اللغة والعرض على الجوال.",
    "حدود التحقق: مسار DeepSeek محاكى في الاختبارات، ولا يوجد تشغيل صوت فعلي في صفحة الواجهة. اختبار الصوت على حساب حقيقي يبقى على المستخدم، وقد يرفض الخادم التذكرة لحسابات غير مشمولة بالتجربة.",
    "المستند أنشئ بصيغة ODT قابلة للتحرير وجرى تصديره والتحقق من عدد صفحاته باستخدام LibreOffice.",
]: body.append(f'<text:p text:style-name="Body">{escape(paragraph)}</text:p>')
content = '''<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2">
<office:font-face-decls><style:font-face style:name="Arial" svg:font-family="Arial"/></office:font-face-decls>
<office:automatic-styles>
<style:style style:name="Body" style:family="paragraph"><style:paragraph-properties fo:text-align="start" style:writing-mode="rl-tb" fo:margin-bottom="0.22cm"/><style:text-properties style:font-name="Arial" fo:font-size="11pt" style:font-name-complex="Arial" style:font-size-complex="11pt"/></style:style>
<style:style style:name="HeadingFirst" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="19pt" fo:font-weight="bold" style:font-size-complex="19pt" style:font-weight-complex="bold" fo:color="#2c468e"/></style:style>
<style:style style:name="HeadingPage" style:family="paragraph" style:parent-style-name="HeadingFirst"><style:paragraph-properties fo:break-before="page"/></style:style>
<style:style style:name="Brand" style:family="paragraph" style:parent-style-name="Body"><style:text-properties fo:font-size="13pt" fo:font-weight="bold" style:font-size-complex="13pt" style:font-weight-complex="bold" fo:color="#3e5bb0"/></style:style>
<style:style style:name="Image" style:family="paragraph"><style:paragraph-properties fo:text-align="center" fo:margin-top="0.3cm" fo:margin-bottom="0.2cm"/></style:style>
<style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" style:font-size-complex="9pt" fo:color="#626978"/></style:style>
</office:automatic-styles><office:body><office:text>''' + ''.join(body) + '</office:text></office:body></office:document-content>'
manifest = ['<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">',
'<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>',
'<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
'<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>']
with zipfile.ZipFile(OUTPUT, 'w') as archive:
    archive.writestr('mimetype', 'application/vnd.oasis.opendocument.text', compress_type=zipfile.ZIP_STORED)
    archive.writestr('content.xml', content, compress_type=zipfile.ZIP_DEFLATED)
    archive.writestr('styles.xml', styles, compress_type=zipfile.ZIP_DEFLATED)
    for _, _, image in steps:
        archive.write(DOCS / 'screenshots' / image, 'Pictures/' + image)
        manifest.append(f'<manifest:file-entry manifest:full-path="Pictures/{image}" manifest:media-type="image/png"/>')
    manifest.append('</manifest:manifest>')
    archive.writestr('META-INF/manifest.xml', ''.join(manifest), compress_type=zipfile.ZIP_DEFLATED)
print(OUTPUT)
