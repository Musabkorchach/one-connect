import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false },
  title: "سياسة الخصوصية | One Connect",
};

export default function PrivacyPage() {
  return (
    <main lang="ar" dir="rtl" className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="rounded-lg border border-border bg-card p-6 text-card-foreground sm:p-10">
        <h1 className="text-2xl font-bold sm:text-4xl">سياسة الخصوصية</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          مسودة قيد الإعداد — لم تُنشر بعد
        </p>

        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-lg font-semibold">المشغّل والتواصل</h2>
          <p>
            يشغّل <bdi>Musab ALFADEL AHMED</bdi> تطبيق One Connect. لاستفسارات الخصوصية أو لتقديم طلب حذف البيانات، راسلنا على <a className="break-all text-accent underline" href="mailto:oneconnect9006@gmail.com">oneconnect9006@gmail.com</a>.
          </p>
        </section>

        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-lg font-semibold">البيانات التي نعالجها ولماذا</h2>
          <ul className="list-disc space-y-3 ps-5">
            <li>
              <strong>الهوية وتسجيل الدخول.</strong> اسم مستخدم Pi ‏(<bdi>Pi username</bdi>) هو هويتك الأساسية داخل One Connect. نستخدم اسم المستخدم ومعرّف الحساب ورمز وصول Pi للتحقق من هويتك، وإنشاء جلسة للتطبيق، وربط بياناتك بحسابك والتحقق من صلاحية الوصول إليها.
            </li>
            <li>
              <strong>البريد الداخلي والخارجي.</strong> نعالج هوية المرسل والمستلم أو عنوان البريد الخارجي، والموضوع، ونص الرسالة، ووقت الإرسال، والبيانات المرتبطة بالقراءة أو التسليم بحسب نوع الرسالة. نستخدمها لإرسال الرسائل واستقبال الردود وعرض صندوق البريد وتحديث حالته. يدعم البريد الداخلي والخارجي الرسائل النصية.
            </li>
            <li>
              <strong>مرفقات البريد.</strong> عند استخدام ميزة المرفقات حيث تكون متاحة، قد يعالج التطبيق محتوى الملف ويخزّنه مع معرّفه واسمه وحجمه وبيانات ربطه بالرسالة أو بأطرافها. تُستخدم هذه البيانات لربط الملف بالرسالة والتحقق من صلاحية الوصول إليه. قد يتلقى مزوّد البريد الخارجي محتوى المرفق عند إرساله عبر خدمته.
            </li>
            <li>
              <strong>الملف الشخصي والمحادثات والمكالمات.</strong> يعالج التطبيق اسم العرض والصورة التي تختارها، وبيانات جهات الاتصال، ومحتوى المحادثات ووسائطها، وعضوية المجموعات، وإشارات إنشاء الاتصال وسجل المكالمات، بحسب الوظيفة المستخدمة. إذا استخدمت الاتصال بأرقام الهاتف حيث يكون متاحًا، يعالج التطبيق رقم الوجهة ويشاركه مع <strong>Twilio</strong> لإجراء المكالمة.
            </li>
            <li>
              <strong>مسودات الفواتير.</strong> عند حفظ مسودة، يخزّن التطبيق البيانات التي تدخلها فيها، مثل بيانات البائع والمشتري والملاحظات، لتتمكن من استرجاعها وتعديلها.
            </li>
            <li>
              <strong>المشتريات داخل التطبيق.</strong> إذا كانت ميزة الشراء متاحة واستخدمتها، تتم عملية الشراء عبر Pi، ويستخدم التطبيق معلومات حالة الشراء لتحديد إمكانية الوصول إلى الميزة.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-lg font-semibold">التخزين ومزوّدو الخدمات</h2>
          <p>
            يُخزّن الخادم سجلات البريد والمحادثات وجهات الاتصال وبعض إعدادات التطبيق في <strong>MongoDB</strong>، ويحفظ الملفات التي تخزّنها الخدمة في <strong>GridFS</strong>. يدير الخادم جلسات التطبيق في ذاكرته، ويستخدم التطبيق تخزين جلسة المتصفح لحفظ علامة تسجيل الخروج وتفضيل اللغة المرتبط بها.
          </p>
          <p>
            يستخدم One Connect <strong>Pi Network</strong> للتحقق من الهوية، و<strong>Mailgun</strong> لإرسال البريد الخارجي واستقبال الردود. يتلقى Mailgun بيانات الرسالة اللازمة للتسليم، وقد تشمل محتوى المرفق عند استخدام مسار إرساله. تصل الرسالة الخارجية كذلك إلى مزوّد بريد المستلم. عند استخدام المكالمات عبر الإنترنت، تساعد خوادم إعداد الاتصال وترحيله على ربط المشاركين بحسب إعداد الخدمة.
          </p>
        </section>

        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-lg font-semibold">صلاحيات الجهاز</h2>
          <p>
            قد يطلب المتصفح إذن الميكروفون عند استخدام مكالمة صوتية أو تسجيل رسالة صوتية، وإذن الكاميرا عند استخدام مكالمة فيديو. يمكنك إدارة هذه الأذونات من إعدادات المتصفح أو الجهاز. عند اختيار ملف من جهازك، يستطيع التطبيق قراءة الملف الذي اخترته لمعالجته ضمن الإجراء الذي طلبته.
          </p>
        </section>

        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-lg font-semibold">حذف الرسائل وطلبات البيانات</h2>
          <p>
            عند حذف رسالة بريد أو رسالة في محادثة من الواجهة، تختفي من صندوق بريدك أو من سجل محادثتك. قد تبقى الرسالة لدى الطرف الآخر وفي التخزين، وقد تبقى مرفقاتها مخزّنة أيضًا.
          </p>
          <p>
            تسجيل الخروج ينهي جلستك في التطبيق، ولا يحذف حسابك أو محتواه.
          </p>
          <p>
            لطلب الاطلاع على بياناتك أو تصحيحها أو حذفها، تواصل معنا على <a className="break-all text-accent underline" href="mailto:oneconnect9006@gmail.com">oneconnect9006@gmail.com</a>.
          </p>
        </section>

        <Link
          href="/terms"
          className="mt-8 inline-block text-accent underline underline-offset-4"
        >
          شروط الاستخدام
        </Link>
      </article>
    </main>
  );
}
