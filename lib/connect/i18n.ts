import type { LangId } from "./data";

export interface Dict {
  signedOut: string;
  signInWithPi: string;
  appName: string;
  tagline: string;
  // tabs
  tabChats: string;
  tabContacts: string;
  tabCalls: string;
  tabEmails: string;
  tabProfile: string;
  tabInvoices: string;
  invoicesEmpty: string;
  invoicesEmptySub: string;
  invoicesPaymentNote: string;
  invoicesLoading: string;
  invoicesLoadError: string;
  invoicesRetry: string;
  invoicesCreateDraft: string;
  invoicesSaving: string;
  invoicesSaveError: string;
  invoicesConflict: string;
  invoicesEditDraft: string;
  invoicesNotes: string;
  invoicesDraftHint: string;
  invoicesInvalidDraft: string;
  invoicesDiscardChanges: string;
  invoiceSeller: string;
  invoiceBuyer: string;
  invoicePartyKind: string;
  invoiceChoose: string;
  invoiceIndividual: string;
  invoiceBusiness: string;
  invoicePublicBody: string;
  invoiceNonprofit: string;
  invoiceIssuerCapacity: string;
  invoicePrivateIndividual: string;
  invoiceProfessional: string;
  invoiceLegalName: string;
  invoiceTradingName: string;
  invoiceAddressLine1: string;
  invoiceAddressLine2: string;
  invoiceCity: string;
  invoicePostalCode: string;
  invoiceRegion: string;
  invoiceCountryCode: string;
  invoiceCountryCodeHint: string;
  // setup
  welcome: string;
  welcomeSub: string;
  displayName: string;
  displayNamePh: string;
  continue: string;
  yourDigitalId: string;
  digitalIdHint: string;
  // common
  cancel: string;
  confirm: string;
  close: string;
  back: string;
  save: string;
  search: string;
  send: string;
  add: string;
  online: string;
  offline: string;
  storageNotice: string;
  today: string;
  yesterday: string;
  // chats
  chatsTitle: string;
  noChats: string;
  noChatsSub: string;
  typeMessage: string;
  statusSent: string;
  statusDelivered: string;
  statusRead: string;
  attachImage: string;
  attachFile: string;
  photo: string;
  file: string;
  encrypted: string;
  // contacts
  contactsTitle: string;
  addContact: string;
  addByUsername: string;
  usernamePh: string;
  requests: string;
  accept: string;
  decline: string;
  noContacts: string;
  noContactsSub: string;
  contactAdded: string;
  alreadyAdded: string;
  cantAddSelf: string;
  message: string;
  call: string;
  // calls
  callsTitle: string;
  noCalls: string;
  voiceCall: string;
  videoCall: string;
  incoming: string;
  outgoing: string;
  missed: string;
  calling: string;
  connecting: string;
  ringing: string;
  mute: string;
  unmute: string;
  speaker: string;
  endCall: string;
  switchCamera: string;
  camera: string;
  // emails
  emailsTitle: string;
  inbox: string;
  sentFolder: string;
  drafts: string;
  compose: string;
  to: string;
  subject: string;
  emailBody: string;
  noEmails: string;
  saveDraft: string;
  attach: string;
  reply: string;
  draftSaved: string;
  emailSent: string;
  subjectPh: string;
  // profile
  profileTitle: string;
  editProfile: string;
  changePhoto: string;
  language: string;
  aboutTitle: string;
  aboutBody: string;
  settings: string;
  enterName: string;

  // profile status and actions
  copied?: string;
  status?: string;
  logout?: string;
  available?: string;
  away?: string;
  busy?: string;
  statusMessage?: string;
  statusMessagePh?: string;
}

const en: Dict = {
  signedOut: "Signed out", signInWithPi: "Sign in with Pi",
  invoiceSeller: "Seller",
  invoiceBuyer: "Buyer",
  invoicePartyKind: "Party type",
  invoiceChoose: "Choose",
  invoiceIndividual: "Individual",
  invoiceBusiness: "Business",
  invoicePublicBody: "Public body",
  invoiceNonprofit: "Nonprofit organization",
  invoiceIssuerCapacity: "Seller capacity",
  invoicePrivateIndividual: "Private individual",
  invoiceProfessional: "Professional",
  invoiceLegalName: "Full name or legal name",
  invoiceTradingName: "Trading name (optional)",
  invoiceAddressLine1: "Address",
  invoiceAddressLine2: "Additional address (optional)",
  invoiceCity: "City",
  invoicePostalCode: "Postal code",
  invoiceRegion: "Region",
  invoiceCountryCode: "Country code",
  invoiceCountryCodeHint: "Two-letter country code, for example FR for France.",
  invoicesEditDraft: "Edit draft",
  invoicesNotes: "Notes",
  invoicesDraftHint: "This document is an editable draft. It has not been issued as a final invoice.",
  invoicesInvalidDraft: "Check the entered information before saving.",
  invoicesDiscardChanges: "Leave without saving your changes?",
  invoicesCreateDraft: "Create draft",
  invoicesSaving: "Saving...",
  invoicesSaveError: "Saving could not be confirmed. Reload the list before trying again.",
  invoicesConflict: "Your drafts changed elsewhere. Reload the list before continuing.",
  invoicesLoading: "Loading invoices...",
  invoicesLoadError: "Unable to load invoices. Please try again.",
  invoicesRetry: "Try again",
  tabInvoices: "Invoices",
  invoicesEmpty: "No invoices to display",
  invoicesEmptySub: "Your invoices and payment details in one place.",
  invoicesPaymentNote: "Invoice in your chosen currency. Pay in Pi.",
  appName: "One Connect",
  tagline: "Your Pi username. One universal ID.",
  tabChats: "Chats",
  tabContacts: "Contacts",
  tabCalls: "Calls",
  tabEmails: "Emails",
  tabProfile: "Profile",
  welcome: "Welcome to One Connect",
  welcomeSub: "Your Pi username becomes your universal ID for messages, calls, and email — no phone number or email needed.",
  displayName: "Display name",
  displayNamePh: "How should people see you?",
  continue: "Continue",
  yourDigitalId: "Your digital ID",
  digitalIdHint: "Share this so others can find and contact you.",
  cancel: "Cancel",
  confirm: "Confirm",
  close: "Close",
  back: "Back",
  save: "Save",
  search: "Search",
  send: "Send",
  add: "Add",
  online: "Online",
  offline: "Offline",
  storageNotice: "Saving to your Pi account…",
  today: "Today",
  yesterday: "Yesterday",
  chatsTitle: "Chats",
  noChats: "No conversations yet",
  noChatsSub: "Start a chat from your contacts.",
  typeMessage: "Message",
  statusSent: "Sent",
  statusDelivered: "Delivered",
  statusRead: "Read",
  attachImage: "Image",
  attachFile: "File",
  photo: "Photo",
  file: "File",
  encrypted: "Messages are end-to-end encrypted",
  contactsTitle: "Contacts",
  addContact: "Add contact",
  addByUsername: "Add by Pi username",
  usernamePh: "pi username",
  requests: "Requests",
  accept: "Accept",
  decline: "Decline",
  noContacts: "No contacts yet",
  noContactsSub: "Add by Pi username.",
  contactAdded: "Contact added",
  alreadyAdded: "Already in your contacts",
  cantAddSelf: "That's your own username",
  message: "Message",
  call: "Call",
  callsTitle: "Calls",
  noCalls: "No calls yet",
  voiceCall: "Voice call",
  videoCall: "Video call",
  incoming: "Incoming",
  outgoing: "Outgoing",
  missed: "Missed",
  calling: "Calling",
  connecting: "Connecting…",
  ringing: "Ringing…",
  mute: "Mute",
  unmute: "Unmute",
  speaker: "Speaker",
  endCall: "End",
  switchCamera: "Flip",
  camera: "Camera",
  emailsTitle: "Emails",
  inbox: "Inbox",
  sentFolder: "Sent",
  drafts: "Drafts",
  compose: "Compose",
  to: "To",
  subject: "Subject",
  emailBody: "Write your message…",
  noEmails: "Nothing here yet",
  saveDraft: "Save draft",
  attach: "Attach",
  reply: "Reply",
  draftSaved: "Draft saved",
  emailSent: "Email sent",
  subjectPh: "Subject",
  profileTitle: "Profile",
  editProfile: "Edit profile",
  changePhoto: "Change photo",
  language: "Language",
  aboutTitle: "About One Connect",
  aboutBody: "One Connect turns your Pi username into a universal digital ID for voice, video, messaging, and email — worldwide, without phone numbers or email addresses.",
  settings: "Settings",
  enterName: "Please enter a display name",
};

const zh: Partial<Dict> = {
  signedOut: "已退出登录", signInWithPi: "使用 Pi 登录",
  tagline: "你的 Pi 用户名，一个通用身份。",
  tabChats: "聊天", tabContacts: "联系人", tabCalls: "通话", tabEmails: "邮件", tabProfile: "我的",
  welcome: "欢迎使用 One Connect", welcomeSub: "你的 Pi 用户名成为消息、通话和邮件的通用身份 — 无需电话号码或邮箱。",
  displayName: "显示名称", displayNamePh: "别人如何看到你？", continue: "继续", yourDigitalId: "你的数字身份", digitalIdHint: "分享它，别人就能找到并联系你。",
  cancel: "取消", confirm: "确认", close: "关闭", back: "返回", save: "保存", search: "搜索", send: "发送", add: "添加", online: "在线", offline: "离线", storageNotice: "正在保存到你的 Pi 账户…", today: "今天", yesterday: "昨天",
  chatsTitle: "聊天", noChats: "还没有会话", noChatsSub: "从联系人开始聊天。", typeMessage: "消息", statusSent: "已发送", statusDelivered: "已送达", statusRead: "已读", attachImage: "图片", attachFile: "文件", photo: "照片", file: "文件", encrypted: "消息已端到端加密",
  contactsTitle: "联系人", addContact: "添加联系人", addByUsername: "通过 Pi 用户名添加", usernamePh: "pi 用户名", requests: "请求", accept: "接受", decline: "拒绝", noContacts: "还没有联系人", noContactsSub: "通过 Pi 用户名添加。", contactAdded: "已添加联系人", alreadyAdded: "已在你的联系人中", cantAddSelf: "这是你自己的用户名", message: "消息", call: "通话",
  callsTitle: "通话", noCalls: "还没有通话", voiceCall: "语音通话", videoCall: "视频通话", incoming: "来电", outgoing: "去电", missed: "未接", calling: "正在呼叫", connecting: "连接中…", ringing: "响铃中…", mute: "静音", unmute: "取消静音", speaker: "扬声器", endCall: "结束", switchCamera: "翻转", camera: "摄像头",
  emailsTitle: "邮件", inbox: "收件箱", sentFolder: "已发送", drafts: "草稿", compose: "写邮件", to: "收件人", subject: "主题", emailBody: "写下你的消息…", noEmails: "这里还没有内容", saveDraft: "保存草稿", attach: "附件", reply: "回复", draftSaved: "草稿已保存", emailSent: "邮件已发送", subjectPh: "主题",
  profileTitle: "我的", editProfile: "编辑资料", changePhoto: "更换照片", language: "语言", aboutTitle: "关于 One Connect", aboutBody: "One Connect 将你的 Pi 用户名变成通用数字身份，用于语音、视频、消息和邮件 — 全球通用，无需电话号码或邮箱。", settings: "设置", enterName: "请输入显示名称",
};

const es: Partial<Dict> = {
  signedOut: "Sesión cerrada", signInWithPi: "Iniciar sesión con Pi",
  tagline: "Tu nombre Pi. Una identidad universal.",
  tabChats: "Chats", tabContacts: "Contactos", tabCalls: "Llamadas", tabEmails: "Correos", tabProfile: "Perfil",
  welcome: "Bienvenido a One Connect", welcomeSub: "Tu nombre Pi se convierte en tu ID universal para mensajes, llamadas y correo — sin número de teléfono ni email.",
  displayName: "Nombre", displayNamePh: "¿Cómo quieres que te vean?", continue: "Continuar", yourDigitalId: "Tu ID digital", digitalIdHint: "Comparte para que otros te encuentren.",
  cancel: "Cancelar", confirm: "Confirmar", close: "Cerrar", back: "Atrás", save: "Guardar", search: "Buscar", send: "Enviar", add: "Añadir", online: "En línea", offline: "Desconectado", storageNotice: "Guardando en tu cuenta Pi…", today: "Hoy", yesterday: "Ayer",
  chatsTitle: "Chats", noChats: "Sin conversaciones", noChatsSub: "Inicia un chat desde tus contactos.", typeMessage: "Mensaje", statusSent: "Enviado", statusDelivered: "Entregado", statusRead: "Leído", attachImage: "Imagen", attachFile: "Archivo", photo: "Foto", file: "Archivo", encrypted: "Los mensajes están cifrados de extremo a extremo",
  contactsTitle: "Contactos", addContact: "Añadir contacto", addByUsername: "Añadir por nombre Pi", usernamePh: "nombre pi", requests: "Solicitudes", accept: "Aceptar", decline: "Rechazar", noContacts: "Sin contactos", noContactsSub: "Añade por nombre Pi.", contactAdded: "Contacto añadido", alreadyAdded: "Ya en tus contactos", cantAddSelf: "Ese es tu nombre", message: "Mensaje", call: "Llamada",
  callsTitle: "Llamadas", noCalls: "Sin llamadas", voiceCall: "Llamada de voz", videoCall: "Videollamada", incoming: "Entrante", outgoing: "Saliente", missed: "Perdida", calling: "Llamando", connecting: "Conectando…", ringing: "Sonando…", mute: "Silenciar", unmute: "Activar", speaker: "Altavoz", endCall: "Terminar", switchCamera: "Cambiar", camera: "Cámara",
  emailsTitle: "Correos", inbox: "Bandeja", sentFolder: "Enviados", drafts: "Borradores", compose: "Escribir", to: "Para", subject: "Asunto", emailBody: "Escribe tu mensaje…", noEmails: "Nada aquí aún", saveDraft: "Guardar borrador", attach: "Adjuntar", reply: "Responder", draftSaved: "Borrador guardado", emailSent: "Correo enviado", subjectPh: "Asunto",
  profileTitle: "Perfil", editProfile: "Editar perfil", changePhoto: "Cambiar foto", language: "Idioma", aboutTitle: "Acerca de One Connect", aboutBody: "One Connect transforma tu nombre Pi en una ID digital universal para voz, video, mensajes y correo — en todo el mundo, sin números de teléfono ni emails.", settings: "Configuración", enterName: "Por favor ingresa un nombre",
};

const fr: Partial<Dict> = {
  signedOut: "Vous êtes déconnecté", signInWithPi: "Se connecter avec Pi",
  invoiceSeller: "Vendeur",
  invoiceBuyer: "Acheteur",
  invoicePartyKind: "Type de partie",
  invoiceChoose: "Choisir",
  invoiceIndividual: "Personne physique",
  invoiceBusiness: "Entreprise",
  invoicePublicBody: "Organisme public",
  invoiceNonprofit: "Organisme à but non lucratif",
  invoiceIssuerCapacity: "Qualité du vendeur",
  invoicePrivateIndividual: "Particulier",
  invoiceProfessional: "Professionnel",
  invoiceLegalName: "Nom complet ou dénomination légale",
  invoiceTradingName: "Nom commercial (facultatif)",
  invoiceAddressLine1: "Adresse",
  invoiceAddressLine2: "Complément d’adresse (facultatif)",
  invoiceCity: "Ville",
  invoicePostalCode: "Code postal",
  invoiceRegion: "Région",
  invoiceCountryCode: "Code pays",
  invoiceCountryCodeHint: "Code pays à deux lettres, par exemple FR pour la France.",
  invoicesEditDraft: "Modifier le brouillon",
  invoicesNotes: "Notes",
  invoicesDraftHint: "Ce document est un brouillon modifiable. Il n’a pas été émis comme facture définitive.",
  invoicesInvalidDraft: "Vérifiez les informations saisies avant d’enregistrer.",
  invoicesDiscardChanges: "Quitter sans enregistrer vos modifications ?",
  invoicesCreateDraft: "Créer un brouillon",
  invoicesSaving: "Enregistrement...",
  invoicesSaveError: "L’enregistrement n’a pas pu être confirmé. Rechargez la liste avant de réessayer.",
  invoicesConflict: "Vos brouillons ont été modifiés ailleurs. Rechargez la liste avant de continuer.",
  invoicesLoading: "Chargement des factures...",
  invoicesLoadError: "Impossible de charger les factures. Veuillez réessayer.",
  invoicesRetry: "Réessayer",
  tabInvoices: "Factures",
  invoicesEmpty: "Aucune facture à afficher",
  invoicesEmptySub: "Vos factures et les détails de paiement au même endroit.",
  invoicesPaymentNote: "Facturez dans la devise de votre choix. Paiement en Pi.",
  tagline: "Votre nom Pi. Une identité universelle.",
  tabChats: "Messages", tabContacts: "Contacts", tabCalls: "Appels", tabEmails: "Emails", tabProfile: "Profil",
  welcome: "Bienvenue sur One Connect", welcomeSub: "Votre nom Pi devient votre ID universel pour les messages, appels et emails — sans numéro de téléphone ni email.",
  displayName: "Nom", displayNamePh: "Comment voulez-vous être vu?", continue: "Continuer", yourDigitalId: "Votre ID numérique", digitalIdHint: "Partagez-le pour que d'autres vous trouvent.",
  cancel: "Annuler", confirm: "Confirmer", close: "Fermer", back: "Retour", save: "Enregistrer", search: "Rechercher", send: "Envoyer", add: "Ajouter", online: "En ligne", offline: "Hors ligne", storageNotice: "Enregistrement sur votre compte Pi…", today: "Aujourd'hui", yesterday: "Hier",
  chatsTitle: "Messages", noChats: "Aucune conversation", noChatsSub: "Commencez un message depuis vos contacts.", typeMessage: "Message", statusSent: "Envoyé", statusDelivered: "Livré", statusRead: "Lu", attachImage: "Image", attachFile: "Fichier", photo: "Photo", file: "Fichier", encrypted: "Les messages sont chiffrés de bout en bout",
  contactsTitle: "Contacts", addContact: "Ajouter contact", addByUsername: "Ajouter par nom Pi", usernamePh: "nom pi", requests: "Demandes", accept: "Accepter", decline: "Refuser", noContacts: "Aucun contact", noContactsSub: "Ajoutez par nom Pi.", contactAdded: "Contact ajouté", alreadyAdded: "Déjà dans vos contacts", cantAddSelf: "C'est votre nom", message: "Message", call: "Appel",
  callsTitle: "Appels", noCalls: "Aucun appel", voiceCall: "Appel vocal", videoCall: "Appel vidéo", incoming: "Entrant", outgoing: "Sortant", missed: "Manqué", calling: "Appel en cours", connecting: "Connexion…", ringing: "Sonnerie…", mute: "Mute", unmute: "Unmute", speaker: "Haut-parleur", endCall: "Terminer", switchCamera: "Changer", camera: "Caméra",
  emailsTitle: "Emails", inbox: "Boîte", sentFolder: "Envoyés", drafts: "Brouillons", compose: "Rédiger", to: "À", subject: "Sujet", emailBody: "Écrivez votre message…", noEmails: "Rien ici pour l'instant", saveDraft: "Enregistrer le brouillon", attach: "Joindre", reply: "Répondre", draftSaved: "Brouillon enregistré", emailSent: "Email envoyé", subjectPh: "Sujet",
  profileTitle: "Profil", editProfile: "Modifier le profil", changePhoto: "Changer la photo", language: "Langue", aboutTitle: "À propos de One Connect", aboutBody: "One Connect transforme votre nom Pi en ID numérique universel pour la voix, la vidéo, la messagerie et l'email — dans le monde entier, sans numéros de téléphone ni emails.", settings: "Paramètres", enterName: "Veuillez entrer un nom",
};

const ar: Partial<Dict> = {
  signedOut: "تم تسجيل الخروج", signInWithPi: "تسجيل الدخول باستخدام Pi",
  invoiceSeller: "البائع",
  invoiceBuyer: "المشتري",
  invoicePartyKind: "نوع الطرف",
  invoiceChoose: "اختر",
  invoiceIndividual: "شخص",
  invoiceBusiness: "شركة أو نشاط تجاري",
  invoicePublicBody: "جهة عامة",
  invoiceNonprofit: "منظمة غير ربحية",
  invoiceIssuerCapacity: "صفة البائع",
  invoicePrivateIndividual: "فرد بصفة شخصية",
  invoiceProfessional: "مهني",
  invoiceLegalName: "الاسم الكامل أو الاسم القانوني",
  invoiceTradingName: "الاسم التجاري (اختياري)",
  invoiceAddressLine1: "العنوان",
  invoiceAddressLine2: "تكملة العنوان (اختياري)",
  invoiceCity: "المدينة",
  invoicePostalCode: "الرمز البريدي",
  invoiceRegion: "المنطقة",
  invoiceCountryCode: "رمز الدولة",
  invoiceCountryCodeHint: "رمز الدولة من حرفين، مثل FR لفرنسا.",
  invoicesEditDraft: "تعديل المسودة",
  invoicesNotes: "ملاحظات",
  invoicesDraftHint: "هذا المستند مسودة قابلة للتعديل، ولم يُصدر كفاتورة نهائية.",
  invoicesInvalidDraft: "راجع البيانات المدخلة قبل الحفظ.",
  invoicesDiscardChanges: "هل تريد المغادرة دون حفظ تعديلاتك؟",
  invoicesCreateDraft: "إنشاء مسودة",
  invoicesSaving: "جارٍ الحفظ...",
  invoicesSaveError: "تعذّر تأكيد الحفظ. أعد تحميل القائمة قبل المحاولة مجددًا.",
  invoicesConflict: "تغيّرت مسوداتك من جلسة أخرى. أعد تحميل القائمة قبل المتابعة.",
  invoicesLoading: "جارٍ تحميل الفواتير...",
  invoicesLoadError: "تعذّر تحميل الفواتير. حاول مرة أخرى.",
  invoicesRetry: "إعادة المحاولة",
  tabInvoices: "الفواتير",
  invoicesEmpty: "لا توجد فواتير للعرض",
  invoicesEmptySub: "فواتيرك وتفاصيل الدفع في مكان واحد.",
  invoicesPaymentNote: "الفاتورة بالعملة التي تختارها، والدفع بـPi.",
  tagline: "اسم Pi الخاص بك. هوية عالمية واحدة.",
  tabChats: "الرسائل", tabContacts: "جهات الاتصال", tabCalls: "المكالمات", tabEmails: "رسائل البريد الإلكتروني", tabProfile: "الملف الشخصي",
  welcome: "مرحبا بك في One Connect", welcomeSub: "يصبح اسم Pi الخاص بك معرّفك العالمي للرسائل والمكالمات والبريد الإلكتروني — بدون رقم هاتف أو بريد إلكتروني.",
  displayName: "اسم العرض", displayNamePh: "كيف تريد أن يراك الآخرون؟", continue: "متابعة", yourDigitalId: "معرفك الرقمي", digitalIdHint: "شاركه حتى يتمكن الآخرون من العثور عليك.",
  cancel: "إلغاء", confirm: "تأكيد", close: "إغلاق", back: "رجوع", save: "حفظ", search: "بحث", send: "إرسال", add: "إضافة", online: "متصل", offline: "غير متصل", storageNotice: "جاري الحفظ على حسابك…", today: "اليوم", yesterday: "أمس",
  chatsTitle: "الرسائل", noChats: "لا توجد محادثات بعد", noChatsSub: "ابدأ محادثة من جهات الاتصال الخاصة بك.", typeMessage: "رسالة", statusSent: "تم الإرسال", statusDelivered: "تم التسليم", statusRead: "مقروء", attachImage: "صورة", attachFile: "ملف", photo: "صورة", file: "ملف", encrypted: "الرسائل مشفرة من طرف إلى طرف",
  contactsTitle: "جهات الاتصال", addContact: "إضافة جهة اتصال", addByUsername: "الإضافة باسم Pi", usernamePh: "اسم pi", requests: "الطلبات", accept: "قبول", decline: "رفض", noContacts: "لا توجد جهات اتصال", noContactsSub: "أضف باسم Pi.", contactAdded: "تم إضافة جهة الاتصال", alreadyAdded: "موجود بالفعل في جهات الاتصال", cantAddSelf: "هذا اسمك", message: "رسالة", call: "اتصال",
  callsTitle: "المكالمات", noCalls: "لا توجد مكالمات", voiceCall: "مكالمة صوتية", videoCall: "مكالمة فيديو", incoming: "وارد", outgoing: "صادر", missed: "فائت", calling: "جاري الاتصال", connecting: "جاري الاتصال…", ringing: "رنين جاري…", mute: "كتم الصوت", unmute: "إلغاء كتم الصوت", speaker: "مكبر الصوت", endCall: "إنهاء", switchCamera: "تبديل", camera: "الكاميرا",
  emailsTitle: "رسائل البريد الإلكتروني", inbox: "الوارد", sentFolder: "المرسل", drafts: "مسودات", compose: "كتابة", to: "إلى", subject: "الموضوع", emailBody: "اكتب رسالتك…", noEmails: "لا شيء هنا حتى الآن", saveDraft: "حفظ المسودة", attach: "إرفاق", reply: "الرد", draftSaved: "تم حفظ المسودة", emailSent: "تم إرسال البريد الإلكتروني", subjectPh: "الموضوع",
  profileTitle: "الملف الشخصي", editProfile: "تعديل الملف الشخصي", changePhoto: "تغيير الصورة", language: "اللغة", aboutTitle: "حول One Connect", aboutBody: "يحول One Connect اسم Pi الخاص بك إلى معرف رقمي عالمي للصوت والفيديو والمراسلة والبريد الإلكتروني — في جميع أنحاء العالم بدون أرقام هاتف أو رسائل بريد إلكترونية.", settings: "الإعدادات", enterName: "يرجى إدخال اسم عرض",
};

const hi: Partial<Dict> = {
  signedOut: "आप साइन आउट हो गए हैं", signInWithPi: "Pi से साइन इन करें",
  tagline: "आपकी Pi उपयोगकर्ता नाम। एक सार्वभौमिक ID।",
  tabChats: "चैट", tabContacts: "संपर्क", tabCalls: "कॉल", tabEmails: "ईमेल", tabProfile: "प्रोफ़ाइल",
  welcome: "One Connect में आपका स्वागत है", welcomeSub: "आपकी Pi उपयोगकर्ता नाम संदेश, कॉल और ईमेल के लिए आपकी सार्वभौमिक ID बन जाती है — कोई फ़ोन नंबर या ईमेल की आवश्यकता नहीं।",
  displayName: "प्रदर्शन नाम", displayNamePh: "लोग आपको कैसे देखें?", continue: "जारी रखें", yourDigitalId: "आपकी डिजिटल ID", digitalIdHint: "इसे साझा करें ताकि दूसरे आपको खोज सकें।",
  cancel: "रद्द करें", confirm: "पुष्टि करें", close: "बंद करें", back: "पीछे", save: "सहेजें", search: "खोजें", send: "भेजें", add: "जोड़ें", online: "ऑनलाइन", offline: "ऑफ़लाइन", storageNotice: "आपके Pi खाते में सहेजा जा रहा है…", today: "आज", yesterday: "कल",
  chatsTitle: "चैट", noChats: "अभी कोई बातचीत नहीं", noChatsSub: "अपने संपर्कों से एक चैट शुरू करें।", typeMessage: "संदेश", statusSent: "भेजा गया", statusDelivered: "पहुंचाया गया", statusRead: "पढ़ा गया", attachImage: "छवि", attachFile: "फ़ाइल", photo: "फ़ोटो", file: "फ़ाइल", encrypted: "संदेश एंड-टू-एंड एन्क्रिप्ट किए गए हैं",
  contactsTitle: "संपर्क", addContact: "संपर्क जोड़ें", addByUsername: "Pi नाम से जोड़ें", usernamePh: "pi नाम", requests: "अनुरोध", accept: "स्वीकार करें", decline: "अस्वीकार करें", noContacts: "कोई संपर्क नहीं", noContactsSub: "Pi नाम से जोड़ें।", contactAdded: "संपर्क जोड़ा गया", alreadyAdded: "पहले से आपके संपर्कों में है", cantAddSelf: "यह आपका नाम है", message: "संदेश", call: "कॉल",
  callsTitle: "कॉल", noCalls: "कोई कॉल नहीं", voiceCall: "आवाज कॉल", videoCall: "वीडियो कॉल", incoming: "आने वाला", outgoing: "जाने वाला", missed: "छूटा हुआ", calling: "कॉल कर रहा है", connecting: "कनेक्ट हो रहा है…", ringing: "बज रहा है…", mute: "मिuting्ट करें", unmute: "अनमिuting्ट करें", speaker: "स्पीकर", endCall: "अंत", switchCamera: "बदलें", camera: "कैमरा",
  emailsTitle: "ईमेल", inbox: "इनबॉक्स", sentFolder: "भेजे गए", drafts: "ड्राफ्ट", compose: "लिखें", to: "को", subject: "विषय", emailBody: "अपना संदेश लिखें…", noEmails: "यहाँ अभी कुछ नहीं", saveDraft: "ड्राफ्ट सहेजें", attach: "संलग्न करें", reply: "जवाब", draftSaved: "ड्राफ्ट सहेजा गया", emailSent: "ईमेल भेजा गया", subjectPh: "विषय",
  profileTitle: "प्रोफ़ाइल", editProfile: "प्रोफ़ाइल संपादित करें", changePhoto: "फ़ोटो बदलें", language: "भाषा", aboutTitle: "One Connect के बारे में", aboutBody: "One Connect आपके Pi उपयोगकर्ता नाम को आवाज, वीडियो, संदेश और ईमेल के लिए एक सार्वभौमिक डिजिटल ID में बदलता है — दुनिया भर में, कोई फ़ोन नंबर या ईमेल के बिना।", settings: "सेटिंग्स", enterName: "कृपया एक डिस्प्ले नाम दर्ज करें",
};

const ru: Partial<Dict> = {
  signedOut: "Вы вышли из аккаунта", signInWithPi: "Войти через Pi",
  tagline: "Ваше имя Pi. Один универсальный ID.",
  tabChats: "Сообщения", tabContacts: "Контакты", tabCalls: "Вызовы", tabEmails: "Электронная почта", tabProfile: "Профиль",
  welcome: "Добро пожаловать в One Connect", welcomeSub: "Ваше имя Pi становится вашим универсальным ID для сообщений, звонков и электронной почты — без номера телефона или электронной почты.",
  displayName: "Отображаемое имя", displayNamePh: "Как вы хотите, чтобы вас видели?", continue: "Продолжить", yourDigitalId: "Ваш цифровой ID", digitalIdHint: "Поделитесь, чтобы другие могли вас найти.",
  cancel: "Отмена", confirm: "Подтвердить", close: "Закрыть", back: "Назад", save: "Сохранить", search: "Поиск", send: "Отправить", add: "Добавить", online: "В сети", offline: "Не в сети", storageNotice: "Сохранение в вашей учетной записи Pi…", today: "Сегодня", yesterday: "Вчера",
  chatsTitle: "Сообщения", noChats: "Нет разговоров", noChatsSub: "Начните чат с контактов.", typeMessage: "Сообщение", statusSent: "Отправлено", statusDelivered: "Доставлено", statusRead: "Прочитано", attachImage: "Изображение", attachFile: "Файл", photo: "Фото", file: "Файл", encrypted: "Сообщения зашифрованы от конца до конца",
  contactsTitle: "Контакты", addContact: "Добавить контакт", addByUsername: "Добавить по имени Pi", usernamePh: "имя pi", requests: "Запросы", accept: "Принять", decline: "Отклонить", noContacts: "Нет контактов", noContactsSub: "Добавить по имени Pi.", contactAdded: "Контакт добавлен", alreadyAdded: "Уже в ваших контактах", cantAddSelf: "Это ваше имя", message: "Сообщение", call: "Вызов",
  callsTitle: "Вызовы", noCalls: "Нет вызовов", voiceCall: "Голосовой вызов", videoCall: "Видеовызов", incoming: "Входящий", outgoing: "Исходящий", missed: "Пропущенный", calling: "Вызов", connecting: "Подключение…", ringing: "Звонок…", mute: "Отключить звук", unmute: "Включить звук", speaker: "Динамик", endCall: "Завершить", switchCamera: "Переключить", camera: "Камера",
  emailsTitle: "Электронная почта", inbox: "Входящие", sentFolder: "Отправленные", drafts: "Черновики", compose: "Написать", to: "Кому", subject: "Тема", emailBody: "Напишите ваше сообщение…", noEmails: "Здесь ничего нет", saveDraft: "Сохранить черновик", attach: "Прикрепить", reply: "Ответить", draftSaved: "Черновик сохранен", emailSent: "Электронное письмо отправлено", subjectPh: "Тема",
  profileTitle: "Профиль", editProfile: "Редактировать профиль", changePhoto: "Изменить фото", language: "Язык", aboutTitle: "О One Connect", aboutBody: "One Connect превращает ваше имя Pi в универсальный цифровой ID для голоса, видео, сообщений и электронной почты — по всему миру, без номеров телефонов и электронных писем.", settings: "Настройки", enterName: "Пожалуйста, введите отображаемое имя",
};

const ja: Partial<Dict> = {
  signedOut: "ログアウトしました", signInWithPi: "Pi でログイン",
  tagline: "あなたのPi名。 1つの普遍的なID。",
  tabChats: "チャット", tabContacts: "連絡先", tabCalls: "通話", tabEmails: "メール", tabProfile: "プロフィール",
  welcome: "One Connectへようこそ", welcomeSub: "あなたのPi名は、メッセージ、通話、メールのための普遍的なIDになります。電話番号やメールは不要です。",
  displayName: "表示名", displayNamePh: "どのように見えたいですか?", continue: "続行", yourDigitalId: "デジタルID", digitalIdHint: "共有して、他の人があなたを見つけられるようにします。",
  cancel: "キャンセル", confirm: "確認", close: "閉じる", back: "戻る", save: "保存", search: "検索", send: "送信", add: "追加", online: "オンライン", offline: "オフライン", storageNotice: "Piアカウントに保存中…", today: "今日", yesterday: "昨日",
  chatsTitle: "チャット", noChats: "会話がありません", noChatsSub: "連絡先からチャットを開始します。", typeMessage: "メッセージ", statusSent: "送信済み", statusDelivered: "配信済み", statusRead: "既読", attachImage: "画像", attachFile: "ファイル", photo: "写真", file: "ファイル", encrypted: "メッセージはエンドツーエンド暗号化されています",
  contactsTitle: "連絡先", addContact: "連絡先を追加", addByUsername: "Pi名で追加", usernamePh: "pi名", requests: "リクエスト", accept: "受け入れる", decline: "拒否", noContacts: "連絡先なし", noContactsSub: "Pi名で追加してください。", contactAdded: "連絡先を追加しました", alreadyAdded: "既に連絡先にあります", cantAddSelf: "これはあなたの名前です", message: "メッセージ", call: "通話",
  callsTitle: "通話", noCalls: "通話なし", voiceCall: "音声通話", videoCall: "ビデオ通話", incoming: "着信", outgoing: "発信", missed: "不在着信", calling: "通話中", connecting: "接続中…", ringing: "鳴っています…", mute: "ミュート", unmute: "ミュート解除", speaker: "スピーカー", endCall: "終了", switchCamera: "切り替え", camera: "カメラ",
  emailsTitle: "メール", inbox: "受信トレイ", sentFolder: "送信済み", drafts: "下書き", compose: "作成", to: "宛先", subject: "件名", emailBody: "メッセージを入力してください…", noEmails: "ここには何もありません", saveDraft: "下書きを保存", attach: "添付", reply: "返信", draftSaved: "下書きが保存されました", emailSent: "メールが送信されました", subjectPh: "件名",
  profileTitle: "プロフィール", editProfile: "プロフィールを編集", changePhoto: "写真を変更", language: "言語", aboutTitle: "One Connectについて", aboutBody: "One Connectは、あなたのPi名を音声、ビデオ、メッセージング、メールのための普遍的なデジタルIDに変えます。電話番号やメールなしで、世界中どこでも利用できます。", settings: "設定", enterName: "表示名を入力してください",
};

const ko: Partial<Dict> = {
  signedOut: "로그아웃되었습니다", signInWithPi: "Pi로 로그인",
  tagline: "당신의 Pi 사용자 이름. 하나의 통합 ID.",
  tabChats: "채팅", tabContacts: "연락처", tabCalls: "통화", tabEmails: "이메일", tabProfile: "프로필",
  welcome: "One Connect에 오신 것을 환영합니다", welcomeSub: "Pi 사용자 이름이 메시지, 통화, 이메일을 위한 통합 ID가 됩니다. 전화번호나 이메일이 필요 없습니다.",
  displayName: "표시 이름", displayNamePh: "어떻게 표시할까요?", continue: "계속", yourDigitalId: "당신의 디지털 ID", digitalIdHint: "공유하면 다른 사람이 찾을 수 있어요.",
  cancel: "취소", confirm: "확인", close: "닫기", back: "뒤로", save: "저장", search: "검색", send: "보내기", add: "추가", online: "온라인", offline: "오프라인", storageNotice: "Pi 계정에 저장 중…", today: "오늘", yesterday: "어제",
  chatsTitle: "채팅", noChats: "아직 대화가 없습니다", noChatsSub: "연락처에서 채팅을 시작하세요.", typeMessage: "메시지", statusSent: "전송됨", statusDelivered: "전달됨", statusRead: "읽음", attachImage: "이미지", attachFile: "파일", photo: "사진", file: "파일", encrypted: "메시지는 종단간 암호화됩니다",
  contactsTitle: "연락처", addContact: "연락처 추가", addByUsername: "Pi 사용자 이름으로 추가", usernamePh: "pi 사용자 이름", requests: "요청", accept: "수락", decline: "거절", noContacts: "연락처가 없습니다", noContactsSub: "Pi 사용자 이름으로 추가하세요.", contactAdded: "연락처 추가됨", alreadyAdded: "이미 있습니다", cantAddSelf: "본인 사용자 이름입니다", message: "메시지", call: "통화",
  callsTitle: "통화", noCalls: "통화 없음", voiceCall: "음성 통화", videoCall: "영상 통화", incoming: "수신", outgoing: "발신", missed: "부재중", calling: "발신 중", connecting: "연결 중…", ringing: "벨 울림…", mute: "음소거", unmute: "해제", speaker: "스피커", endCall: "종료", switchCamera: "전환", camera: "카메라",
  emailsTitle: "이메일", inbox: "받은편지함", sentFolder: "보낸편지함", drafts: "임시보관", compose: "작성", to: "받는 사람", subject: "제목", emailBody: "메시지를 작성하세요…", noEmails: "여기엔 아직 없어요", saveDraft: "임시 저장", attach: "첨부", reply: "답장", draftSaved: "임시 저장됨", emailSent: "이메일 전송됨", subjectPh: "제목",
  profileTitle: "프로필", editProfile: "프로필 편집", changePhoto: "사진 변경", language: "언어", aboutTitle: "One Connect 소개", aboutBody: "One Connect는 Pi 사용자 이름을 음성, 영상, 메시지, 이메일을 위한 통합 디지털 ID로 만듭니다.", settings: "설정", enterName: "표시 이름을 입력하세요",
};

const pt: Partial<Dict> = {
  signedOut: "Sessão encerrada", signInWithPi: "Entrar com Pi",
  tagline: "Seu usuário Pi. Uma identidade universal.",
  tabChats: "Conversas", tabContacts: "Contatos", tabCalls: "Chamadas", tabEmails: "E-mails", tabProfile: "Perfil",
  welcome: "Bem-vindo ao One Connect", welcomeSub: "Seu usuário Pi vira sua identidade universal para mensagens, chamadas e e-mail — sem telefone ou e-mail.",
  displayName: "Nome", displayNamePh: "Como querem te ver?", continue: "Continuar", yourDigitalId: "Seu ID digital", digitalIdHint: "Compartilhe para que te encontrem.",
  cancel: "Cancelar", confirm: "Confirmar", close: "Fechar", back: "Voltar", save: "Salvar", search: "Buscar", send: "Enviar", add: "Adicionar", online: "Online", offline: "Offline", storageNotice: "Salvando na sua conta Pi…", today: "Hoje", yesterday: "Ontem",
  chatsTitle: "Conversas", noChats: "Sem conversas ainda", noChatsSub: "Inicie uma conversa dos contatos.", typeMessage: "Mensagem", statusSent: "Enviado", statusDelivered: "Entregue", statusRead: "Lido", attachImage: "Imagem", attachFile: "Arquivo", photo: "Foto", file: "Arquivo", encrypted: "Mensagens com criptografia de ponta a ponta",
  contactsTitle: "Contatos", addContact: "Adicionar contato", addByUsername: "Adicionar por usuário Pi", usernamePh: "usuário pi", requests: "Solicitações", accept: "Aceitar", decline: "Recusar", noContacts: "Sem contatos", noContactsSub: "Adicione por usuário Pi.", contactAdded: "Contato adicionado", alreadyAdded: "Já nos contatos", cantAddSelf: "Esse é o seu usuário", message: "Mensagem", call: "Ligar",
  callsTitle: "Chamadas", noCalls: "Sem chamadas", voiceCall: "Chamada de voz", videoCall: "Videochamada", incoming: "Recebida", outgoing: "Feita", missed: "Perdida", calling: "Chamando", connecting: "Conectando…", ringing: "Chamando…", mute: "Mudo", unmute: "Ativar", speaker: "Alto-falante", endCall: "Encerrar", switchCamera: "Virar", camera: "Câmera",
  emailsTitle: "E-mails", inbox: "Caixa", sentFolder: "Enviados", drafts: "Rascunhos", compose: "Escrever", to: "Para", subject: "Assunto", emailBody: "Escreva sua mensagem…", noEmails: "Nada aqui ainda", saveDraft: "Salvar rascunho", attach: "Anexar", reply: "Responder", draftSaved: "Rascunho salvo", emailSent: "E-mail enviado", subjectPh: "Assunto",
  profileTitle: "Perfil", editProfile: "Editar perfil", changePhoto: "Trocar foto", language: "Idioma", aboutTitle: "Sobre o One Connect", aboutBody: "O One Connect transforma seu usuário Pi numa identidade digital universal para voz, vídeo, mensagens e e-mail.", settings: "Config.", enterName: "Digite um nome",
};

const de: Partial<Dict> = {
  signedOut: "Abgemeldet", signInWithPi: "Mit Pi anmelden",
  tagline: "Dein Pi-Nutzername. Eine universelle ID.",
  tabChats: "Chats", tabContacts: "Kontakte", tabCalls: "Anrufe", tabEmails: "E-Mails", tabProfile: "Profil",
  welcome: "Willkommen bei One Connect", welcomeSub: "Dein Pi-Nutzername wird deine universelle ID für Nachrichten, Anrufe und E-Mail – ohne Telefonnummer oder E-Mail.",
  displayName: "Anzeigename", displayNamePh: "Wie sollen dich andere sehen?", continue: "Weiter", yourDigitalId: "Deine digitale ID", digitalIdHint: "Teile sie, damit dich andere finden.",
  cancel: "Abbrechen", confirm: "Bestätigen", close: "Schließen", back: "Zurück", save: "Speichern", search: "Suchen", send: "Senden", add: "Hinzufügen", online: "Online", offline: "Offline", storageNotice: "Wird in deinem Pi-Konto gespeichert…", today: "Heute", yesterday: "Gestern",
  chatsTitle: "Chats", noChats: "Noch keine Chats", noChatsSub: "Starte einen Chat aus den Kontakten.", typeMessage: "Nachricht", statusSent: "Gesendet", statusDelivered: "Zugestellt", statusRead: "Gelesen", attachImage: "Bild", attachFile: "Datei", photo: "Foto", file: "Datei", encrypted: "Nachrichten sind Ende-zu-Ende verschlüsselt",
  contactsTitle: "Kontakte", addContact: "Kontakt hinzufügen", addByUsername: "Per Pi-Nutzername hinzufügen", usernamePh: "pi-nutzername", requests: "Anfragen", accept: "Annehmen", decline: "Ablehnen", noContacts: "Keine Kontakte", noContactsSub: "Per Pi-Nutzername hinzufügen.", contactAdded: "Kontakt hinzugefügt", alreadyAdded: "Bereits vorhanden", cantAddSelf: "Das ist dein Name", message: "Nachricht", call: "Anrufen",
  callsTitle: "Anrufe", noCalls: "Keine Anrufe", voiceCall: "Sprachanruf", videoCall: "Videoanruf", incoming: "Eingehend", outgoing: "Ausgehend", missed: "Verpasst", calling: "Ruft an", connecting: "Verbinde…", ringing: "Klingelt…", mute: "Stumm", unmute: "Ton an", speaker: "Lautspr.", endCall: "Beenden", switchCamera: "Wechseln", camera: "Kamera",
  emailsTitle: "E-Mails", inbox: "Posteingang", sentFolder: "Gesendet", drafts: "Entwürfe", compose: "Schreiben", to: "An", subject: "Betreff", emailBody: "Schreibe deine Nachricht…", noEmails: "Noch nichts hier", saveDraft: "Entwurf speichern", attach: "Anhängen", reply: "Antworten", draftSaved: "Entwurf gespeichert", emailSent: "E-Mail gesendet", subjectPh: "Betreff",
  profileTitle: "Profil", editProfile: "Profil bearbeiten", changePhoto: "Foto ändern", language: "Sprache", aboutTitle: "Über One Connect", aboutBody: "One Connect macht deinen Pi-Nutzernamen zur universellen digitalen ID für Sprache, Video, Nachrichten und E-Mail.", settings: "Einstellungen", enterName: "Bitte Anzeigenamen eingeben",
};

const it: Partial<Dict> = {
  signedOut: "Disconnessione effettuata", signInWithPi: "Accedi con Pi",
  tagline: "Il tuo nome Pi. Un'identità universale.",
  tabChats: "Chat", tabContacts: "Contatti", tabCalls: "Chiamate", tabEmails: "E-mail", tabProfile: "Profilo",
  welcome: "Benvenuto su One Connect", welcomeSub: "Il tuo nome Pi diventa la tua identità universale per messaggi, chiamate e e-mail — senza telefono né e-mail.",
  displayName: "Nome", displayNamePh: "Come vuoi apparire?", continue: "Continua", yourDigitalId: "Il tuo ID digitale", digitalIdHint: "Condividilo per farti trovare.",
  cancel: "Annulla", confirm: "Conferma", close: "Chiudi", back: "Indietro", save: "Salva", search: "Cerca", send: "Invia", add: "Aggiungi", online: "Online", offline: "Offline", storageNotice: "Salvataggio nel tuo account Pi…", today: "Oggi", yesterday: "Ieri",
  chatsTitle: "Chat", noChats: "Nessuna conversazione", noChatsSub: "Avvia una chat dai contatti.", typeMessage: "Messaggio", statusSent: "Inviato", statusDelivered: "Consegnato", statusRead: "Letto", attachImage: "Immagine", attachFile: "File", photo: "Foto", file: "File", encrypted: "Messaggi crittografati end-to-end",
  contactsTitle: "Contatti", addContact: "Aggiungi contatto", addByUsername: "Aggiungi con nome Pi", usernamePh: "nome pi", requests: "Richieste", accept: "Accetta", decline: "Rifiuta", noContacts: "Nessun contatto", noContactsSub: "Aggiungi con nome Pi.", contactAdded: "Contatto aggiunto", alreadyAdded: "Già nei contatti", cantAddSelf: "È il tuo nome", message: "Messaggio", call: "Chiama",
  callsTitle: "Chiamate", noCalls: "Nessuna chiamata", voiceCall: "Chiamata vocale", videoCall: "Videochiamata", incoming: "In arrivo", outgoing: "In uscita", missed: "Persa", calling: "Chiamata", connecting: "Connessione…", ringing: "Squilla…", mute: "Muto", unmute: "Attiva", speaker: "Altoparl.", endCall: "Termina", switchCamera: "Ruota", camera: "Fotocam.",
  emailsTitle: "E-mail", inbox: "In arrivo", sentFolder: "Inviate", drafts: "Bozze", compose: "Scrivi", to: "A", subject: "Oggetto", emailBody: "Scrivi il tuo messaggio…", noEmails: "Ancora niente qui", saveDraft: "Salva bozza", attach: "Allega", reply: "Rispondi", draftSaved: "Bozza salvata", emailSent: "E-mail inviata", subjectPh: "Oggetto",
  profileTitle: "Profilo", editProfile: "Modifica profilo", changePhoto: "Cambia foto", language: "Lingua", aboutTitle: "Info su One Connect", aboutBody: "One Connect trasforma il tuo nome Pi in un'identità digitale universale per voce, video, messaggi e e-mail.", settings: "Impostazioni", enterName: "Inserisci un nome",
};

const tr: Partial<Dict> = {
  signedOut: "Oturum kapatıldı", signInWithPi: "Pi ile giriş yap",
  tagline: "Pi kullanıcı adın. Tek evrensel kimlik.",
  tabChats: "Sohbetler", tabContacts: "Kişiler", tabCalls: "Aramalar", tabEmails: "E-posta", tabProfile: "Profil",
  welcome: "One Connect'e hoş geldin", welcomeSub: "Pi kullanıcı adın mesaj, arama ve e-posta için evrensel kimliğin olur; telefon ya da e-posta gerekmez.",
  displayName: "Görünen ad", displayNamePh: "Nasıl görünmek istersin?", continue: "Devam", yourDigitalId: "Dijital kimliğin", digitalIdHint: "Bulunman için paylaş.",
  cancel: "İptal", confirm: "Onayla", close: "Kapat", back: "Geri", save: "Kaydet", search: "Ara", send: "Gönder", add: "Ekle", online: "Çevrimiçi", offline: "Çevrimdışı", storageNotice: "Pi hesabına kaydediliyor…", today: "Bugün", yesterday: "Dün",
  chatsTitle: "Sohbetler", noChats: "Henüz sohbet yok", noChatsSub: "Kişilerden sohbet başlat.", typeMessage: "Mesaj", statusSent: "Gönderildi", statusDelivered: "İletildi", statusRead: "Okundu", attachImage: "Görsel", attachFile: "Dosya", photo: "Fotoğraf", file: "Dosya", encrypted: "Mesajlar uçtan uca şifreli",
  contactsTitle: "Kişiler", addContact: "Kişi ekle", addByUsername: "Pi adıyla ekle", usernamePh: "pi kullanıcı adı", requests: "İstekler", accept: "Kabul", decline: "Reddet", noContacts: "Kişi yok", noContactsSub: "Pi adıyla ekle.", contactAdded: "Kişi eklendi", alreadyAdded: "Zaten ekli", cantAddSelf: "Bu senin adın", message: "Mesaj", call: "Ara",
  callsTitle: "Aramalar", noCalls: "Arama yok", voiceCall: "Sesli arama", videoCall: "Görüntülü arama", incoming: "Gelen", outgoing: "Giden", missed: "Cevapsız", calling: "Aranıyor", connecting: "Bağlanıyor…", ringing: "Çalıyor…", mute: "Sessiz", unmute: "Aç", speaker: "Hoparlör", endCall: "Bitir", switchCamera: "Çevir", camera: "Kamera",
  emailsTitle: "E-posta", inbox: "Gelen", sentFolder: "Gönderilen", drafts: "Taslaklar", compose: "Yaz", to: "Kime", subject: "Konu", emailBody: "Mesajını yaz…", noEmails: "Burada bir şey yok", saveDraft: "Taslağı kaydet", attach: "Ekle", reply: "Yanıtla", draftSaved: "Taslak kaydedildi", emailSent: "E-posta gönderildi", subjectPh: "Konu",
  profileTitle: "Profil", editProfile: "Profili düzenle", changePhoto: "Fotoğrafı değiştir", language: "Dil", aboutTitle: "One Connect hakkında", aboutBody: "One Connect, Pi kullanıcı adını ses, görüntü, mesaj ve e-posta için evrensel dijital kimliğe dönüştürür.", settings: "Ayarlar", enterName: "Bir görünen ad gir",
};

const vi: Partial<Dict> = {
  signedOut: "Đã đăng xuất", signInWithPi: "Đăng nhập bằng Pi",
  tagline: "Tên Pi của bạn. Một danh tính chung.",
  tabChats: "Trò chuyện", tabContacts: "Danh bạ", tabCalls: "Cuộc gọi", tabEmails: "Email", tabProfile: "Hồ sơ",
  welcome: "Chào mừng đến One Connect", welcomeSub: "Tên Pi trở thành danh tính chung cho tin nhắn, cuộc gọi và email — không cần số điện thoại hay email.",
  displayName: "Tên hiển thị", displayNamePh: "Người khác thấy bạn thế nào?", continue: "Tiếp tục", yourDigitalId: "ID số của bạn", digitalIdHint: "Chia sẻ để người khác tìm thấy bạn.",
  cancel: "Hủy", confirm: "Xác nhận", close: "Đóng", back: "Quay lại", save: "Lưu", search: "Tìm", send: "Gửi", add: "Thêm", online: "Trực tuyến", offline: "Ngoại tuyến", storageNotice: "Đang lưu vào tài khoản Pi…", today: "Hôm nay", yesterday: "Hôm qua",
  chatsTitle: "Trò chuyện", noChats: "Chưa có cuộc trò chuyện", noChatsSub: "Bắt đầu từ danh bạ.", typeMessage: "Tin nhắn", statusSent: "Đã gửi", statusDelivered: "Đã nhận", statusRead: "Đã xem", attachImage: "Ảnh", attachFile: "Tệp", photo: "Ảnh", file: "Tệp", encrypted: "Tin nhắn được mã hóa đầu cuối",
  contactsTitle: "Danh bạ", addContact: "Thêm liên hệ", addByUsername: "Thêm bằng tên Pi", usernamePh: "tên pi", requests: "Lời mời", accept: "Chấp nhận", decline: "Từ chối", noContacts: "Chưa có liên hệ", noContactsSub: "Thêm bằng tên Pi.", contactAdded: "Đã thêm liên hệ", alreadyAdded: "Đã có trong danh bạ", cantAddSelf: "Đó là tên của bạn", message: "Nhắn tin", call: "Gọi",
  callsTitle: "Cuộc gọi", noCalls: "Chưa có cuộc gọi", voiceCall: "Gọi thoại", videoCall: "Gọi video", incoming: "Đến", outgoing: "Đi", missed: "Nhỡ", calling: "Đang gọi", connecting: "Đang kết nối…", ringing: "Đang đổ chuông…", mute: "Tắt tiếng", unmute: "Bật tiếng", speaker: "Loa", endCall: "Kết thúc", switchCamera: "Lật", camera: "Camera",
  emailsTitle: "Email", inbox: "Hộp thư", sentFolder: "Đã gửi", drafts: "Nháp", compose: "Soạn", to: "Đến", subject: "Chủ đề", emailBody: "Viết tin nhắn của bạn…", noEmails: "Chưa có gì ở đây", saveDraft: "Lưu nháp", attach: "Đính kèm", reply: "Trả lời", draftSaved: "Đã lưu nháp", emailSent: "Đã gửi email", subjectPh: "Chủ đề",
  profileTitle: "Hồ sơ", editProfile: "Sửa hồ sơ", changePhoto: "Đổi ảnh", language: "Ngôn ngữ", aboutTitle: "Về One Connect", aboutBody: "One Connect biến tên Pi thành danh tính số chung cho thoại, video, tin nhắn và email trên toàn cầu.", settings: "Cài đặt", enterName: "Vui lòng nhập tên hiển thị",
};

const am: Partial<Dict> = {
  signedOut: "ወጥተዋል", signInWithPi: "በ Pi ይግቡ",
  tagline: "የእርስዎ Pi ስም። አንድ ሁሉን አቀፍ መለያ።",
  tabChats: "ውይይቶች", tabContacts: "እውቂያዎች", tabCalls: "ጥሪዎች", tabEmails: "ኢሜይሎች", tabProfile: "መገለጫ",
  welcome: "ወደ One Connect እንኳን በደህና መጡ", welcomeSub: "የእርስዎ Pi ስም ለመልዕክቶች፣ ጥሪዎች እና ኢሜይል ሁሉን አቀፍ መለያዎ ይሆናል።",
  displayName: "የሚታይ ስም", displayNamePh: "ሌሎች እንዴት ያዩዎት?", continue: "ቀጥል", yourDigitalId: "የእርስዎ ዲጂታል መለያ", digitalIdHint: "ሌሎች እንዲያገኙዎት ያጋሩት።",
  cancel: "ሰርዝ", confirm: "አረጋግጥ", close: "ዝጋ", back: "ተመለስ", save: "አስቀምጥ", search: "ፈልግ", send: "ላክ", add: "ጨምር", online: "በመስመር ላይ", offline: "ከመስመር ውጭ", storageNotice: "ወደ Pi መለያዎ በማስቀመጥ ላይ…", today: "ዛሬ", yesterday: "ትናንት",
  chatsTitle: "ውይይቶች", noChats: "እስካሁን ውይይት የለም", noChatsSub: "ከእውቂያዎችዎ ውይይት ይጀምሩ።", typeMessage: "መልዕክት", statusSent: "ተልኳል", statusDelivered: "ደርሷል", statusRead: "ተነቧል", attachImage: "ምስል", attachFile: "ፋይል", photo: "ፎቶ", file: "ፋይል", encrypted: "መልዕክቶች ከመጨረሻ እስከ መጨረሻ ተመስጥረዋል",
  contactsTitle: "እውቂያዎች", addContact: "እውቂያ ጨምር", addByUsername: "በPi ስም ጨምር", usernamePh: "የPi ስም", requests: "ጥያቄዎች", accept: "ተቀበል", decline: "እምቢ በል", noContacts: "እስካሁን እውቂያ የለም", noContactsSub: "በPi ስም ይጨምሩ።", contactAdded: "እውቂያ ታክሏል", alreadyAdded: "አስቀድሞ ታክሏል", cantAddSelf: "ይህ የእርስዎ ስም ነው", message: "መልዕክት", call: "ደውል",
  callsTitle: "ጥሪዎች", noCalls: "እስካሁን ጥሪ የለም", voiceCall: "የድምጽ ጥሪ", videoCall: "የቪዲዮ ጥሪ", incoming: "ገቢ", outgoing: "ወጪ", missed: "ያመለጠ", calling: "በመደወል ላይ", connecting: "በመገናኘት ላይ…", ringing: "በመደወል ላይ…", mute: "ድምጽ አጥፋ", unmute: "ድምጽ አብራ", speaker: "ድምጽ ማጉያ", endCall: "ጨርስ", switchCamera: "ቀይር", camera: "ካሜራ",
  emailsTitle: "ኢሜይሎች", inbox: "ገቢ መልዕክቶች", sentFolder: "የተላኩ", drafts: "ረቂቆች", compose: "ጻፍ", to: "ለ", subject: "ርዕስ", emailBody: "መልዕክትዎን ይጻፉ…", noEmails: "እስካሁን ምንም የለም", saveDraft: "ረቂቅ አስቀምጥ", attach: "አያይዝ", reply: "መልስ", draftSaved: "ረቂቅ ተቀምጧል", emailSent: "ኢሜይል ተልኳል", subjectPh: "ርዕስ",
  profileTitle: "መገለጫ", editProfile: "መገለጫ አርትዕ", changePhoto: "ፎቶ ቀይር", language: "ቋንቋ", aboutTitle: "ስለ One Connect", aboutBody: "One Connect የPi ስምዎን ለድምጽ፣ ለቪዲዮ፣ ለመልዕክት እና ለኢሜይል ሁሉን አቀፍ ዲጂታል መለያ ያደርገዋል።", settings: "ቅንብሮች", enterName: "እባክዎ የሚታይ ስም ያስገቡ",
};

const ti: Partial<Dict> = {
  signedOut: "ወጺእኩም", signInWithPi: "ብ Pi እቶ",
  tagline: "ናይ እርስኻ Pi ስም። ሓደ ዓለምለኻዊ መንነት።",
  tabChats: "ዕላል", tabContacts: "ተራኸብቲ", tabCalls: "ጻውዒት", tabEmails: "ኢመይል", tabProfile: "መግለጺ",
  welcome: "እንቋዕ ናብ One Connect ብደሓን መጻእኩም", welcomeSub: "ናይ እርስኻ Pi ስም ንመልእኽቲ፣ ጻውዒትን ኢመይልን ዓለምለኻዊ መንነትካ ይኸውን።",
  displayName: "ዝርአ ስም", displayNamePh: "ካልኦት ከመይ ክርእዩኻ ትደሊ?", continue: "ቀጽል", yourDigitalId: "ዲጂታላዊ መንነትካ", digitalIdHint: "ካልኦት ክረኽቡኻ ኣካፍሎ።",
  cancel: "ሰርዝ", confirm: "ኣረጋግጽ", close: "ዕጸው", back: "ተመለስ", save: "ዓቅብ", search: "ድለ", send: "ልኣኽ", add: "ወስኽ", online: "ኣብ መስመር", offline: "ካብ መስመር ወጻኢ", storageNotice: "ናብ ሕሳብ Pi ይዕቀብ ኣሎ…", today: "ሎሚ", yesterday: "ትማሊ",
  chatsTitle: "ዕላል", noChats: "ገና ዕላል የለን", noChatsSub: "ካብ ተራኸብትኻ ዕላል ጀምር።", typeMessage: "መልእኽቲ", statusSent: "ተላኢኹ", statusDelivered: "በጺሑ", statusRead: "ተነቢቡ", attachImage: "ምስሊ", attachFile: "ፋይል", photo: "ስእሊ", file: "ፋይል", encrypted: "መልእኽቲ ካብ መወዳእታ ክሳብ መወዳእታ ተመስጢሩ",
  contactsTitle: "ተራኸብቲ", addContact: "ተራኻቢ ወስኽ", addByUsername: "ብPi ስም ወስኽ", usernamePh: "Pi ስም", requests: "ሕቶታት", accept: "ተቐበል", decline: "ኣይትቀበል", noContacts: "ገና ተራኸብቲ የለዉን", noContactsSub: "ብPi ስም ወስኽ።", contactAdded: "ተራኻቢ ተወሲኹ", alreadyAdded: "ድሮ ተወሲኹ", cantAddSelf: "እዚ ናትካ ስም እዩ", message: "መልእኽቲ", call: "ጸውዕ",
  callsTitle: "ጻውዒት", noCalls: "ገና ጻውዒት የለን", voiceCall: "ድምጺ ጻውዒት", videoCall: "ቪድዮ ጻውዒት", incoming: "ዝመጽእ", outgoing: "ዝወጽእ", missed: "ዝተረፈ", calling: "ይጽውዕ ኣሎ", connecting: "ይራኸብ ኣሎ…", ringing: "ይደውል ኣሎ…", mute: "ድምጺ ኣጥፋ", unmute: "ድምጺ ኣብራ", speaker: "መደርደሪ ድምጺ", endCall: "ወድእ", switchCamera: "ቀይር", camera: "ካሜራ",
  emailsTitle: "ኢመይል", inbox: "ዝኣተወ", sentFolder: "ዝተላእከ", drafts: "ረቂቕ", compose: "ጽሓፍ", to: "ናብ", subject: "ኣርእስቲ", emailBody: "መልእኽትኻ ጽሓፍ…", noEmails: "ገና ሓደ ነገር የለን", saveDraft: "ረቂቕ ዓቅብ", attach: "ኣተሓሕዝ", reply: "መልሲ", draftSaved: "ረቂቕ ተዓቂቡ", emailSent: "ኢመይል ተላኢኹ", subjectPh: "ኣርእስቲ",
  profileTitle: "መግለጺ", editProfile: "መግለጺ ኣርም", changePhoto: "ስእሊ ቀይር", language: "ቋንቋ", aboutTitle: "ብዛዕባ One Connect", aboutBody: "One Connect ንPi ስምካ ንድምጺ፣ ቪድዮ፣ መልእኽቲን ኢመይልን ዓለምለኻዊ ዲጂታላዊ መንነት ይገብሮ።", settings: "ቅንብራት", enterName: "በጃኻ ዝርአ ስም ኣእቱ",
};

const id: Partial<Dict> = {
  signedOut: "Anda telah keluar", signInWithPi: "Masuk dengan Pi",
  tagline: "Nama Pi Anda. Satu identitas universal.",
  tabChats: "Obrolan", tabContacts: "Kontak", tabCalls: "Panggilan", tabEmails: "Email", tabProfile: "Profil",
  welcome: "Selamat datang di One Connect", welcomeSub: "Nama Pi Anda menjadi identitas universal untuk pesan, panggilan, dan email — tanpa nomor telepon atau email.",
  displayName: "Nama tampilan", displayNamePh: "Bagaimana orang melihat Anda?", continue: "Lanjut", yourDigitalId: "ID digital Anda", digitalIdHint: "Bagikan agar orang bisa menemukan Anda.",
  cancel: "Batal", confirm: "Konfirmasi", close: "Tutup", back: "Kembali", save: "Simpan", search: "Cari", send: "Kirim", add: "Tambah", online: "Online", offline: "Offline", storageNotice: "Menyimpan ke akun Pi Anda…", today: "Hari ini", yesterday: "Kemarin",
  chatsTitle: "Obrolan", noChats: "Belum ada obrolan", noChatsSub: "Mulai obrolan dari kontak.", typeMessage: "Pesan", statusSent: "Terkirim", statusDelivered: "Sampai", statusRead: "Dibaca", attachImage: "Gambar", attachFile: "Berkas", photo: "Foto", file: "Berkas", encrypted: "Pesan dienkripsi ujung ke ujung",
  contactsTitle: "Kontak", addContact: "Tambah kontak", addByUsername: "Tambah dengan nama Pi", usernamePh: "nama pi", requests: "Permintaan", accept: "Terima", decline: "Tolak", noContacts: "Belum ada kontak", noContactsSub: "Tambah dengan nama Pi.", contactAdded: "Kontak ditambahkan", alreadyAdded: "Sudah ada di kontak", cantAddSelf: "Itu nama Anda sendiri", message: "Pesan", call: "Panggil",
  callsTitle: "Panggilan", noCalls: "Belum ada panggilan", voiceCall: "Panggilan suara", videoCall: "Panggilan video", incoming: "Masuk", outgoing: "Keluar", missed: "Tak terjawab", calling: "Memanggil", connecting: "Menghubungkan…", ringing: "Berdering…", mute: "Bisu", unmute: "Bunyikan", speaker: "Speaker", endCall: "Akhiri", switchCamera: "Ubah", camera: "Kamera",
  emailsTitle: "Email", inbox: "Masuk", sentFolder: "Terkirim", drafts: "Draf", compose: "Tulis", to: "Untuk", subject: "Subjek", emailBody: "Tulis pesan Anda…", noEmails: "Belum ada apa-apa", saveDraft: "Simpan draf", attach: "Lampirkan", reply: "Balas", draftSaved: "Draf disimpan", emailSent: "Email terkirim", subjectPh: "Subjek",
  profileTitle: "Profil", editProfile: "Edit profil", changePhoto: "Ubah foto", language: "Bahasa", aboutTitle: "Tentang One Connect", aboutBody: "One Connect mengubah nama Pi Anda menjadi ID digital universal untuk suara, video, pesan, dan email di seluruh dunia.", settings: "Pengaturan", enterName: "Silakan masukkan nama tampilan",
};

export function getDict(lang: LangId): Dict {
  const overrides = {
    zh,
    es,
    fr,
    ar,
    hi,
    ru,
    ja,
    ko,
    pt,
    de,
    it,
    tr,
    vi,
    id,
    am,
    ti,
  } as Record<LangId, Partial<Dict>>;
  return { ...en, ...(overrides[lang] || {}) } as Dict;
}

const deletionCopy = {
  en: {
    action: "Delete One Connect account",
    description: "This deletes your One Connect account. Your Pi identity stays active. Your data and your copies of messages are deleted and cannot be restored when you return. Recipients may keep their copies. Completed group ownership transfers are honored. Other groups you own are archived for remaining members.",
    acknowledge: "I understand that my One Connect data cannot be restored.",
    expired: "The confirmation expired. Confirm again to get a new one.",
    limited: "Too many attempts. Wait before trying again.",
    verification: "Pi could not verify your identity. Try again.",
    failed: "Could not prepare the deletion request. Try again.",
    uncertain: "The response is unavailable. Your request may have been accepted. Retry this confirmation while it is available.",
    accepted: "Account deletion request accepted",
    deleting: "Account deletion is in progress",
  },
  ar: {
    action: "حذف حساب One Connect",
    description: "يحذف هذا الإجراء حسابك في One Connect وتبقى هوية Pi الخاصة بك. تُحذف بياناتك ونسخك من الرسائل ولا تُستعاد عند العودة. قد يحتفظ المستلمون بنسخهم. تُحترم عمليات نقل ملكية المجموعات المكتملة، وتُؤرشف المجموعات الأخرى التي تملكها للأعضاء الباقين.",
    acknowledge: "أقرّ بأن بياناتي في One Connect لا يمكن استعادتها.",
    expired: "انتهت صلاحية التأكيد. أكّد مجددًا للحصول على تأكيد جديد.",
    limited: "تجاوزت حد المحاولات. انتظر قبل المحاولة مجددًا.",
    verification: "تعذّر التحقق من هويتك لدى Pi. حاول مجددًا.",
    failed: "تعذّر تجهيز طلب الحذف. حاول مجددًا.",
    uncertain: "لم يصل الرد. ربما قُبل طلبك. أعد إرسال التأكيد نفسه ما دام متاحًا.",
    accepted: "تم قبول طلب حذف الحساب",
    deleting: "حذف الحساب جارٍ",
  },
  zh: {
    action: "删除 One Connect 帐号",
    description: "此操作会删除你的 One Connect 帐号，你的 Pi 身份仍然有效。你的数据和消息副本会被删除，重新加入也无法恢复。收件人可以保留副本。已完成的群组所有权转移继续有效，其余你拥有的群组将归档，供剩余成员查看。",
    acknowledge: "我了解我的 One Connect 数据无法恢复。",
    expired: "确认已过期，请重新确认。",
    limited: "尝试次数过多，请稍后再试。",
    verification: "Pi 无法验证你的身份，请重试。",
    failed: "无法准备删除请求，请重试。",
    uncertain: "未收到回复，请求可能已经被接受。确认仍可用时请重试同一确认。",
    accepted: "帐号删除请求已受理",
    deleting: "正在删除帐号",
  },
  es: {
    action: "Eliminar mi cuenta de One Connect",
    description: "Esto elimina tu cuenta de One Connect. Tu identidad de Pi sigue activa. Se eliminan tus datos y tus copias de mensajes, y no se recuperan si vuelves. Los destinatarios pueden conservar sus copias. Se respetan las transferencias de grupos ya completadas. Los demás grupos que posees se archivan para sus miembros restantes.",
    acknowledge: "Entiendo que mis datos de One Connect no se pueden recuperar.",
    expired: "La confirmación ha caducado. Confirma de nuevo.",
    limited: "Demasiados intentos. Espera antes de volver a intentarlo.",
    verification: "Pi no pudo verificar tu identidad. Inténtalo de nuevo.",
    failed: "No se pudo preparar la solicitud. Inténtalo de nuevo.",
    uncertain: "No llegó la respuesta. Es posible que se haya aceptado tu solicitud. Reintenta la misma confirmación mientras esté disponible.",
    accepted: "Solicitud de eliminación aceptada",
    deleting: "La eliminación de la cuenta está en curso",
  },
  fr: {
    action: "Supprimer mon compte One Connect",
    description: "Cette action supprime votre compte One Connect. Votre identité Pi reste active. Vos données et copies des messages sont supprimées définitivement, même si vous revenez. Les destinataires peuvent conserver leurs copies. Les transferts de propriété terminés sont respectés. Vos autres groupes sont archivés pour leurs membres restants.",
    acknowledge: "Je comprends que mes données One Connect ne pourront pas être récupérées.",
    expired: "La confirmation a expiré. Confirmez à nouveau.",
    limited: "Trop de tentatives. Patientez avant de réessayer.",
    verification: "Pi n’a pas pu vérifier votre identité. Réessayez.",
    failed: "La demande de suppression n’a pas pu être préparée. Réessayez.",
    uncertain: "La réponse n’est pas arrivée. Votre demande a peut-être été acceptée. Réessayez la même confirmation tant qu’elle est disponible.",
    accepted: "Demande de suppression acceptée",
    deleting: "Suppression du compte en cours",
  },
  hi: {
    action: "One Connect खाता हटाएँ",
    description: "इससे आपका One Connect खाता हटेगा। आपकी Pi पहचान सक्रिय रहेगी। आपका डेटा और संदेशों की आपकी प्रतियाँ मिट जाएँगी और लौटने पर भी वापस नहीं मिलेंगी। प्राप्तकर्ता अपनी प्रतियाँ रख सकते हैं। समूहों का पूरा हो चुका स्वामित्व हस्तांतरण बना रहेगा। आपके अन्य समूह बाकी सदस्यों के लिए संग्रहित किए जाएँगे।",
    acknowledge: "मुझे पता है कि मेरा One Connect डेटा वापस नहीं मिल सकता।",
    expired: "पुष्टि की समय-सीमा समाप्त हुई। फिर से पुष्टि करें।",
    limited: "बहुत अधिक प्रयास। दोबारा कोशिश करने से पहले प्रतीक्षा करें।",
    verification: "Pi आपकी पहचान सत्यापित नहीं कर सका। फिर से कोशिश करें।",
    failed: "हटाने का अनुरोध तैयार नहीं हो सका। फिर से कोशिश करें।",
    uncertain: "जवाब नहीं मिला। आपका अनुरोध स्वीकार हो सकता है। पुष्टि उपलब्ध रहते हुए उसी की दोबारा कोशिश करें।",
    accepted: "खाता हटाने का अनुरोध स्वीकार हुआ",
    deleting: "खाता हटाया जा रहा है",
  },
  ru: {
    action: "Удалить аккаунт One Connect",
    description: "Будет удалён ваш аккаунт One Connect. Ваш идентификатор Pi останется активным. Ваши данные и копии сообщений будут удалены без возможности восстановления при возвращении. Получатели могут сохранить свои копии. Завершённые передачи прав на группы сохраняются. Остальные ваши группы архивируются для оставшихся участников.",
    acknowledge: "Я понимаю, что мои данные One Connect нельзя восстановить.",
    expired: "Срок подтверждения истёк. Подтвердите снова.",
    limited: "Слишком много попыток. Подождите и попробуйте снова.",
    verification: "Pi не смог подтвердить вашу личность. Попробуйте снова.",
    failed: "Не удалось подготовить запрос. Попробуйте снова.",
    uncertain: "Ответ не получен. Запрос мог быть принят. Повторите то же подтверждение, пока оно доступно.",
    accepted: "Запрос на удаление аккаунта принят",
    deleting: "Аккаунт удаляется",
  },
  ja: {
    action: "One Connect アカウントを削除",
    description: "One Connect のアカウントを削除します。Pi の ID は引き続き有効です。データとメッセージの自分のコピーが削除され、再登録しても復元できません。受信者のコピーが残ることがあります。完了済みのグループ所有権の移行は維持され、所有するその他のグループは残りのメンバー向けにアーカイブされます。",
    acknowledge: "One Connect のデータを復元できないことを理解しました。",
    expired: "確認の有効期限が切れました。もう一度確認してください。",
    limited: "試行回数が多すぎます。時間をおいて再試行してください。",
    verification: "Pi で本人確認ができませんでした。再試行してください。",
    failed: "削除リクエストを準備できませんでした。再試行してください。",
    uncertain: "応答がありません。リクエストが受理された可能性があります。有効な間に同じ確認を再送してください。",
    accepted: "アカウントの削除リクエストを受理しました",
    deleting: "アカウントを削除中です",
  },
  ko: {
    action: "One Connect 계정 삭제",
    description: "One Connect 계정을 삭제합니다. Pi 신원은 계속 유효합니다. 데이터와 메시지 사본은 삭제되며 다시 가입해도 복구되지 않습니다. 수신자는 자신의 사본을 보관할 수 있습니다. 완료된 그룹 소유권 이전은 유지되며, 소유한 나머지 그룹은 남은 멤버를 위해 보관됩니다.",
    acknowledge: "One Connect 데이터를 복구할 수 없음을 이해했습니다.",
    expired: "확인이 만료되었습니다. 다시 확인해 주세요.",
    limited: "시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    verification: "Pi에서 신원을 확인하지 못했습니다. 다시 시도해 주세요.",
    failed: "삭제 요청을 준비하지 못했습니다. 다시 시도해 주세요.",
    uncertain: "응답을 받지 못했습니다. 요청이 수락되었을 수 있습니다. 가능할 때 동일한 확인을 다시 시도해 주세요.",
    accepted: "계정 삭제 요청이 접수되었습니다",
    deleting: "계정 삭제가 진행 중입니다",
  },
  pt: {
    action: "Excluir conta do One Connect",
    description: "Isso exclui sua conta do One Connect. Sua identidade Pi permanece ativa. Seus dados e suas cópias das mensagens são excluídos e não podem ser recuperados se você voltar. Os destinatários podem manter suas cópias. As transferências de propriedade de grupos já concluídas são respeitadas. Seus outros grupos são arquivados para os membros restantes.",
    acknowledge: "Entendo que meus dados do One Connect não podem ser recuperados.",
    expired: "A confirmação expirou. Confirme novamente.",
    limited: "Muitas tentativas. Aguarde antes de tentar novamente.",
    verification: "O Pi não pôde verificar sua identidade. Tente novamente.",
    failed: "Não foi possível preparar o pedido de exclusão. Tente novamente.",
    uncertain: "A resposta não chegou. Seu pedido pode ter sido aceito. Repita a mesma confirmação enquanto estiver disponível.",
    accepted: "Pedido de exclusão da conta aceito",
    deleting: "A exclusão da conta está em andamento",
  },
  de: {
    action: "One-Connect-Konto löschen",
    description: "Dein One-Connect-Konto wird gelöscht. Deine Pi-Identität bleibt aktiv. Deine Daten und Nachrichtenkopien werden dauerhaft gelöscht, auch wenn du zurückkehrst. Empfänger können ihre Kopien behalten. Abgeschlossene Übertragungen von Gruppeneigentum bleiben gültig. Deine übrigen Gruppen werden für die verbleibenden Mitglieder archiviert.",
    acknowledge: "Ich verstehe, dass meine One-Connect-Daten nicht wiederhergestellt werden können.",
    expired: "Die Bestätigung ist abgelaufen. Bestätige erneut.",
    limited: "Zu viele Versuche. Warte vor dem nächsten Versuch.",
    verification: "Pi konnte deine Identität nicht prüfen. Versuche es erneut.",
    failed: "Die Löschanfrage konnte nicht vorbereitet werden. Versuche es erneut.",
    uncertain: "Die Antwort ist ausgeblieben. Deine Anfrage wurde möglicherweise angenommen. Wiederhole dieselbe Bestätigung, solange sie verfügbar ist.",
    accepted: "Anfrage zur Kontolöschung angenommen",
    deleting: "Das Konto wird gelöscht",
  },
  it: {
    action: "Elimina l’account One Connect",
    description: "Il tuo account One Connect verrà eliminato. La tua identità Pi resta attiva. I tuoi dati e le tue copie dei messaggi verranno eliminati e non potrai recuperarli se torni. I destinatari possono conservare le loro copie. I trasferimenti di proprietà dei gruppi completati restano validi. Gli altri gruppi che possiedi vengono archiviati per i membri rimanenti.",
    acknowledge: "Ho capito che i miei dati di One Connect non possono essere recuperati.",
    expired: "La conferma è scaduta. Conferma di nuovo.",
    limited: "Troppi tentativi. Attendi prima di riprovare.",
    verification: "Pi non ha potuto verificare la tua identità. Riprova.",
    failed: "Impossibile preparare la richiesta di eliminazione. Riprova.",
    uncertain: "La risposta non è arrivata. La richiesta potrebbe essere stata accettata. Riprova con la stessa conferma finché disponibile.",
    accepted: "Richiesta di eliminazione accettata",
    deleting: "Eliminazione dell’account in corso",
  },
  tr: {
    action: "One Connect hesabını sil",
    description: "One Connect hesabın silinir. Pi kimliğin etkin kalır. Verilerin ve mesaj kopyaların silinir ve geri döndüğünde geri yüklenmez. Alıcılar kendi kopyalarını saklayabilir. Tamamlanmış grup sahipliği devirleri geçerliliğini korur. Sahibi olduğun diğer gruplar kalan üyeler için arşivlenir.",
    acknowledge: "One Connect verilerimin geri yüklenemeyeceğini anlıyorum.",
    expired: "Onayın süresi doldu. Yeniden onayla.",
    limited: "Çok fazla deneme. Yeniden denemeden önce bekle.",
    verification: "Pi kimliğini doğrulayamadı. Tekrar dene.",
    failed: "Silme isteği hazırlanamadı. Tekrar dene.",
    uncertain: "Yanıt alınamadı. İsteğin kabul edilmiş olabilir. Kullanılabilir olduğu sürece aynı onayı yeniden dene.",
    accepted: "Hesap silme isteği kabul edildi",
    deleting: "Hesap siliniyor",
  },
  vi: {
    action: "Xóa tài khoản One Connect",
    description: "Tài khoản One Connect của bạn sẽ bị xóa. Danh tính Pi của bạn vẫn hoạt động. Dữ liệu và bản sao tin nhắn của bạn sẽ bị xóa và không thể khôi phục khi bạn quay lại. Người nhận có thể giữ bản sao của họ. Việc chuyển quyền sở hữu nhóm đã hoàn tất vẫn có hiệu lực. Các nhóm khác do bạn sở hữu sẽ được lưu trữ cho các thành viên còn lại.",
    acknowledge: "Tôi hiểu dữ liệu One Connect của mình không thể khôi phục.",
    expired: "Xác nhận đã hết hạn. Vui lòng xác nhận lại.",
    limited: "Quá nhiều lần thử. Hãy chờ trước khi thử lại.",
    verification: "Pi không xác minh được danh tính của bạn. Hãy thử lại.",
    failed: "Không thể chuẩn bị yêu cầu xóa. Hãy thử lại.",
    uncertain: "Chưa nhận được phản hồi. Yêu cầu có thể đã được chấp nhận. Hãy thử lại với cùng xác nhận khi còn dùng được.",
    accepted: "Đã chấp nhận yêu cầu xóa tài khoản",
    deleting: "Đang xóa tài khoản",
  },
  id: {
    action: "Hapus akun One Connect",
    description: "Akun One Connect Anda akan dihapus. Identitas Pi Anda tetap aktif. Data dan salinan pesan Anda dihapus dan tidak dapat dipulihkan saat Anda kembali. Penerima dapat menyimpan salinan mereka. Pengalihan kepemilikan grup yang telah selesai tetap berlaku. Grup lain yang Anda miliki diarsipkan untuk anggota yang tersisa.",
    acknowledge: "Saya memahami bahwa data One Connect saya tidak dapat dipulihkan.",
    expired: "Konfirmasi sudah kedaluwarsa. Lakukan konfirmasi lagi.",
    limited: "Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.",
    verification: "Pi tidak dapat memverifikasi identitas Anda. Coba lagi.",
    failed: "Permintaan penghapusan tidak dapat disiapkan. Coba lagi.",
    uncertain: "Tanggapan belum diterima. Permintaan mungkin sudah diterima. Ulangi konfirmasi yang sama selagi masih tersedia.",
    accepted: "Permintaan penghapusan akun diterima",
    deleting: "Penghapusan akun sedang berlangsung",
  },
  am: {
    action: "የ One Connect መለያን ሰርዝ",
    description: "የ One Connect መለያዎ ይሰረዛል። የ Pi መለያዎ ይቀጥላል። ውሂብዎና የመልዕክት ቅጂዎችዎ ይሰረዛሉ፣ ሲመለሱም አይመለሱም። ተቀባዮች ቅጂዎቻቸውን ሊያስቀምጡ ይችላሉ። የተጠናቀቀ የቡድን ባለቤትነት ዝውውር ይቀጥላል። ሌሎች ቡድኖችዎ ለቀሩት አባላት ይቀመጣሉ።",
    acknowledge: "የ One Connect ውሂቤን መመለስ እንደማልችል ተረድቻለሁ።",
    expired: "የማረጋገጫው ጊዜ አልፏል። እንደገና ያረጋግጡ።",
    limited: "ብዙ ሙከራዎች ተደርገዋል። እንደገና ከመሞከርዎ በፊት ይጠብቁ።",
    verification: "Pi ማንነትዎን ማረጋገጥ አልቻለም። እንደገና ይሞክሩ።",
    failed: "የመሰረዝ ጥያቄው ሊዘጋጅ አልቻለም። እንደገና ይሞክሩ።",
    uncertain: "ምላሽ አልደረሰም። ጥያቄዎ ተቀባይነት አግኝቶ ሊሆን ይችላል። ተመሳሳዩን ማረጋገጫ በጊዜው ይሞክሩ።",
    accepted: "የመለያ መሰረዝ ጥያቄዎ ተቀብሏል",
    deleting: "መለያው በመሰረዝ ላይ ነው",
  },
  ti: {
    action: "ናይ One Connect መለለዪ ደምስስ",
    description: "ናይ One Connect መለለዪኻ ይድምሰስ። ናይ Pi መለለዪኻ ግን ይጸንሕ። ሓበሬታኻን ቅዳሓት መልእኽትታትካን ይድምሰሱ፣ ምስ ተመለስካ ድማ ኣይምለሱን። ተቐበልቲ ቅዳሓቶም ከቐምጡ ይኽእሉ። ዝተዛዘመ ምትሕልላፍ ዋንነት ጉጅለ ይጸንሕ። ካልኦት ጉጅለታትካ ንዝተረፉ ኣባላት ይቕመጡ።",
    acknowledge: "ናይ One Connect ሓበሬታይ ክምለስ ከም ዘይክእል ተረዲአ ኣለኹ።",
    expired: "ናይ ምርግጋጽ ግዜ ሓሊፉ። ደጊምካ ኣረጋግጽ።",
    limited: "ብዙሕ ፈተነ ተገይሩ። ቅድሚ ደጊምካ ምፍታን ተጸበ።",
    verification: "Pi መንነትካ ከረጋግጽ ኣይከኣለን። ደጊምካ ፈትን።",
    failed: "ናይ ምድምሳስ ሕቶ ክዳሎ ኣይከኣለን። ደጊምካ ፈትን።",
    uncertain: "መልሲ ኣይመጸን። ሕቶኻ ተቐባልነት ረኺቡ ክኸውን ይኽእል። እቲ ምርግጋጽ ከሎ ብተመሳሳሊ ደጊምካ ፈትን።",
    accepted: "ናይ ምድምሳስ መለለዪ ሕቶ ተቐባልነት ረኺቡ",
    deleting: "መለለዪ ይድምሰስ ኣሎ",
  },
} satisfies Record<LangId, Record<"action" | "description" | "acknowledge" | "expired" | "limited" | "verification" | "failed" | "uncertain" | "accepted" | "deleting", string>>;

export function getDeletionCopy(lang: LangId) {
  return deletionCopy[lang] ?? deletionCopy.en;
}

const groupEnglish = {
  title: "Group information", loading: "Loading group information?", owner: "Owner",
  members: "Group members", invitations: "Group invitations", admin: "Admin", member: "Member",
  remove: "Remove member", demote: "Remove admin role", promote: "Make admin",
  offer: "Offer ownership", acceptOwnership: "Accept ownership", decline: "Decline",
  receivedOffer: "offered you ownership.", sentOffer: "Ownership offered to",
  name: "Name", description: "Description", save: "Save details", username: "Pi username",
  invite: "Invite", revoke: "Revoke invitation", leave: "Leave group", accept: "Accept",
  confirm: "Confirm", cancel: "Cancel", failure: "Could not update the group. Try again.",
  alreadyMember: "This person is already a member.", alreadyInvited: "This invitation is already pending.",
  groupFull: "The group has reached its member and invitation limit.",
  notVerified: "The invitee must sign in with a verified Pi account first.",
};

const groupTranslations: Partial<Record<LangId, typeof groupEnglish>> = {
  ar: {
    title: "??????? ????????", loading: "???? ????? ??????? ?????????", owner: "??????",
    members: "????? ????????", invitations: "????? ?????????", admin: "????", member: "???",
    remove: "????? ?????", demote: "??? ??????", promote: "????? ????",
    offer: "??? ??? ???????", acceptOwnership: "???? ???????", decline: "???",
    receivedOffer: "??? ???? ??? ???????.", sentOffer: "???? ??? ??????? ???",
    name: "?????", description: "?????", save: "??? ????????", username: "??? ?????? Pi",
    invite: "????", revoke: "??? ??????", leave: "?????? ????????", accept: "????",
    confirm: "?????", cancel: "?????", failure: "????? ????? ????????. ???? ??????.",
    alreadyMember: "??? ????? ??? ?? ???????? ??????.", alreadyInvited: "???? ???? ?????? ???? ?????.",
    groupFull: "???? ???????? ???? ?????? ??????? ????????.",
    notVerified: "??? ?????? ????? ?????? ????? ????? Pi ?????.",
  },
  fr: {
    title: "Informations du groupe", loading: "Chargement des informations du groupe?", owner: "Propri?taire",
    members: "Membres du groupe", invitations: "Invitations aux groupes", admin: "Administrateur", member: "Membre",
    remove: "Retirer le membre", demote: "Retirer le r?le administrateur", promote: "Nommer administrateur",
    offer: "Proposer le transfert de propri?t?", acceptOwnership: "Accepter la propri?t?", decline: "Refuser",
    receivedOffer: "vous a propos? la propri?t?.", sentOffer: "Propri?t? propos?e ?",
    name: "Nom", description: "Description", save: "Enregistrer", username: "Nom d?utilisateur Pi",
    invite: "Inviter", revoke: "R?voquer l?invitation", leave: "Quitter le groupe", accept: "Accepter",
    confirm: "Confirmer", cancel: "Annuler", failure: "Impossible de mettre ? jour le groupe. R?essayez.",
    alreadyMember: "Cette personne est d?j? membre.", alreadyInvited: "Cette invitation est d?j? en attente.",
    groupFull: "Le groupe a atteint sa limite de membres et d?invitations.",
    notVerified: "La personne invit?e doit d?abord se connecter avec un compte Pi v?rifi?.",
  },
};

export function getGroupCopy(lang: LangId) {
  return groupTranslations[lang] ?? groupEnglish;
}
