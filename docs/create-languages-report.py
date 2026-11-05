"""Create editable ODT; LibreOffice exports the real multilingual UI screenshots to PDF."""
from html import escape
from pathlib import Path
import zipfile

DOCS = Path(__file__).resolve().parent
OUTPUT = DOCS / 'BDS-live-languages-guide.odt'
STEPS = [
    ('01 — اختيار لغة استماع Live',
     'افتح الوصول السريع ثم إعدادات الصوت. اختر لغة استماع Live؛ القائمة تضم 71 خيار لغة ومنطقة مع إدخال رمز BCP 47 آخر عند الحاجة. اللغة توجّه التعرّف على كلامك فقط، لأن النطق كله من صوت DeepSeek بعد اكتمال الرد.',
     'languages-1-english-listening.png', '15cm', '12.19cm'),
    ('02 — اللغات المختلفة وشاشة الجوال',
     'تم التحقق بعرض 390 بكسل دون تمرير أفقي، مع تمييز الصينية التقليدية عن المبسطة في القائمة. هذا ليس اكتشافًا تلقائيًا للكلام المختلط: اختر لغة واحدة ثم بدّل يدويًا. تغيير اللغة أثناء Live يلغي النص الجزئي والرد القديم ويعيد التعرف باللغة الجديدة.',
     'languages-2-mobile-chinese.png', '8.3cm', '17.96cm'),
]
BODY = []
for index, (title, description, image, width, height) in enumerate(STEPS):
    if index == 0:
        BODY.append('<text:p text:style-name="Brand">BETTER DEEPSEEK — دليل لغات Live</text:p>')
        BODY.append('<text:p text:style-name="Body">4 نوفمبر 2026 | صور Chromium فعلية لواجهة اختبار معزولة؛ البيانات في الصور تجريبية وليست حساب المستخدم.</text:p>')
    heading = 'Heading' if index == 0 else 'HeadingPage'
    BODY.append(f'<text:p text:style-name="{heading}">{escape(title)}</text:p>')
    BODY.append(f'<text:p text:style-name="Body">{escape(description)}</text:p>')
    BODY.append(f'<text:p text:style-name="Image"><draw:frame draw:name="Step{index}" text:anchor-type="as-char" svg:width="{width}" svg:height="{height}"><draw:image xlink:href="Pictures/{image}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>')
    BODY.append(f'<text:p text:style-name="Caption">لقطة {index+1} — واجهة الإضافة الفعلية، بيانات اختبار مضبوطة.</text:p>')
BODY.append('<text:p text:style-name="HeadingPage">التفعيل والحدود والتحقق</text:p>')
for paragraph in [
    '1. أعد تحميل Better DeepSeek من chrome://extensions أو edge://extensions، ثم حدّث صفحة DeepSeek. لا توجد خدمة صوت محلية ولا صوت متصفح.',
    '2. افتح إعدادات الصوت واختر لغة استماع Live. التعرف على كلامك ما زال عبر المتصفح وقد يحتاج الإنترنت.',
    '3. صوت DeepSeek هو المسار الوحيد للنطق: يقرأ كل رد بعد اكتماله، وأثناء القراءة يتوقف الميكروفون مؤقتًا ثم يعود الاستماع.',
    'الحدود: لا يمكن ضمان كل لغات العالم. دعم التعرف يعتمد على المتصفح؛ وقراءة الردود تعتمد على توفّر صوت DeepSeek للحساب، وقد ترفض التذكرة أو تنفد الحصة اليومية.',
    'الخصوصية: قراءة الردود ترسل نص الرد إلى خدمة DeepSeek نفسها (وهو نص أنتجه الخادم أصلًا)، بينما التعرف على كلامك قد يستخدم خدمة المتصفح عبر الإنترنت.',
    'التحقق: اختبارات JavaScript آلية، واختبار واجهة Chromium حقيقي للغة والحفظ والعرض على الجوال. لم تُختبر جودة نطق فعلية لكل لغة، ولا جلسة ميكروفون داخل حساب المستخدم.',
    'المستند ODT قابل للتحرير، واستُخدم LibreOffice لإنتاج نسخة PDF وفحص عدد صفحاتها.',
]:
    BODY.append(f'<text:p text:style-name="Body">{escape(paragraph)}</text:p>')
content = '''<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2">
<office:font-face-decls><style:font-face style:name="Arial" svg:font-family="Arial"/></office:font-face-decls><office:automatic-styles>
<style:style style:name="Body" style:family="paragraph"><style:paragraph-properties style:writing-mode="rl-tb" fo:text-align="start" fo:line-height="140%" fo:margin-bottom="0.22cm"/><style:text-properties style:font-name="Arial" fo:font-size="11pt" style:font-name-complex="Arial" style:font-size-complex="11pt"/></style:style>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="19pt" style:font-size-complex="19pt" fo:font-weight="bold" style:font-weight-complex="bold" fo:color="#2c468e"/></style:style>
<style:style style:name="HeadingPage" style:family="paragraph" style:parent-style-name="Heading"><style:paragraph-properties fo:break-before="page"/></style:style>
<style:style style:name="Brand" style:family="paragraph" style:parent-style-name="Body"><style:text-properties fo:font-size="13pt" style:font-size-complex="13pt" fo:font-weight="bold" style:font-weight-complex="bold" fo:color="#3e5bb0"/></style:style>
<style:style style:name="Image" style:family="paragraph"><style:paragraph-properties fo:text-align="center" fo:margin-top="0.25cm"/></style:style>
<style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" style:font-size-complex="9pt" fo:color="#626978"/></style:style>
</office:automatic-styles><office:body><office:text>''' + ''.join(BODY) + '</office:text></office:body></office:document-content>'
styles = '''<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="140%"/><style:text-properties style:font-name="Arial" fo:font-size="11pt"/></style:default-style></office:styles>
<office:automatic-styles><style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin="1.8cm" style:print-orientation="portrait"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Page"/></office:master-styles></office:document-styles>'''
manifest = ['<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">',
'<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>',
'<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
'<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>']
with zipfile.ZipFile(OUTPUT, 'w') as archive:
    archive.writestr('mimetype', 'application/vnd.oasis.opendocument.text', compress_type=zipfile.ZIP_STORED)
    archive.writestr('content.xml', content, compress_type=zipfile.ZIP_DEFLATED)
    archive.writestr('styles.xml', styles, compress_type=zipfile.ZIP_DEFLATED)
    for _, _, image, _, _ in STEPS:
        archive.write(DOCS / 'screenshots' / image, 'Pictures/' + image)
        manifest.append(f'<manifest:file-entry manifest:full-path="Pictures/{image}" manifest:media-type="image/png"/>')
    manifest.append('</manifest:manifest>')
    archive.writestr('META-INF/manifest.xml', ''.join(manifest), compress_type=zipfile.ZIP_DEFLATED)
print(OUTPUT)
