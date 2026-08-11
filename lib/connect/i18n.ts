import type { LangId } from "./data";

export interface Dict {
  appName: string;
  tagline: string;
  // tabs
  tabChats: string;
  tabContacts: string;
  tabCalls: string;
  tabEmails: string;
  tabProfile: string;
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
}

const en: Dict = {
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
