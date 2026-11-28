import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false },
  title: "شروط الاستخدام | One Connect",
};

export default function TermsPage() {
  return (
    <main lang="ar" dir="rtl" className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="rounded-lg border border-border bg-card p-6 text-card-foreground sm:p-10">
        <h1 className="text-2xl font-bold sm:text-4xl">شروط الاستخدام</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          مسودة قيد الإعداد — لم تُنشر بعد
        </p>

        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-lg font-semibold">الخدمة والحساب</h2>
          <p>
            يقدّم <bdi>Musab ALFADEL AHMED</bdi> تطبيق One Connect للتواصل باستخدام اسم مستخدم Pi. تشمل وظائف البريد إرسال الرسائل داخليًا وإرسال البريد خارجيًا واستقبال الردود. تعتمد إتاحة المرفقات والمكالمات والوظائف الأخرى على إعداد التطبيق والجهاز الذي تستخدمه.
          </p>
          <p>
            استخدم حساب Pi الذي يحق لك استخدامه، وحافظ على سرية بيانات الدخول والجلسة. إذا أردت شراء ميزة مدفوعة معروضة داخل التطبيق، راجع السعر المعروض قبل تأكيد الشراء. إذا اشتبهت في استخدام حسابك دون إذنك، راسلنا على <a className="break-all text-accent underline" href="mailto:oneconnect9006@gmail.com">oneconnect9006@gmail.com</a>.
          </p>
        </section>

        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-lg font-semibold">استخدام الخدمة والمحتوى</h2>
          <p>
            أرسل المحتوى الذي تملك حق مشاركته، وراجع عنوان المستلم قبل الإرسال، خصوصًا عند مراسلة عنوان خارجي. امتنع عن انتحال الهوية أو الاحتيال أو المضايقة أو إرسال رسائل جماعية غير مرغوب فيها أو ملفات ضارة أو محاولة الوصول إلى حسابات الآخرين وبياناتهم دون إذن.
          </p>
          <p>
            يعالج One Connect المحتوى الذي ترسله لتشغيل الوظيفة التي تستخدمها، مثل إيصال الرسالة وعرضها في صندوق البريد. قد يحتفظ المستلم بنسخة مما ترسله، وقد يعالج مزوّد بريده الرسالة وفق سياساته.
          </p>
        </section>

        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-lg font-semibold">توفر الخدمة والدعم</h2>
          <p>
            يعتمد تسجيل الدخول وتسليم البريد الخارجي وبعض وظائف الاتصال على خدمات خارجية. قد يتأخر تسليم الرسالة أو يتعذر بسبب إعدادات المستلم أو خدمة البريد أو الاتصال بالشبكة. للدعم أو الإبلاغ عن إساءة استخدام أو للاستفسار عن الخصوصية أو طلب حذف البيانات، تواصل معنا على <a className="break-all text-accent underline" href="mailto:oneconnect9006@gmail.com">oneconnect9006@gmail.com</a>.
          </p>
        </section>

        <Link
          href="/privacy"
          className="mt-8 inline-block text-accent underline underline-offset-4"
        >
          سياسة الخصوصية
        </Link>
      </article>
    </main>
  );
}
