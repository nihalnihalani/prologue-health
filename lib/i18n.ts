/**
 * Multilingual patient-facing strings.
 *
 * THE DESIGN RULE, and it is the whole point:
 *
 *   The PATIENT hears and reads their own language.
 *   The CLINICAL RECORD is always English.
 *   The patient's ORIGINAL WORDS are preserved verbatim, in their language,
 *   and are one click away from the clinician.
 *
 * A translated summary is an interpretation. The clinician must be able to reach
 * what was actually said — so we never discard the original, and we never show
 * the clinician a translation without a path back to the source.
 *
 * Language selection covers the most common languages requiring interpreter
 * services in US ambulatory care. Gemini Live detects and switches spoken
 * language automatically; these strings cover the UI and the engine's computed
 * questions, which are generated rather than transcribed.
 */

export const LOCALES = {
  en: { label: "English", native: "English", bcp47: "en-US", dir: "ltr" },
  es: { label: "Spanish", native: "Español", bcp47: "es-US", dir: "ltr" },
  zh: { label: "Chinese", native: "中文", bcp47: "cmn-CN", dir: "ltr" },
  vi: { label: "Vietnamese", native: "Tiếng Việt", bcp47: "vi-VN", dir: "ltr" },
  hi: { label: "Hindi", native: "हिन्दी", bcp47: "hi-IN", dir: "ltr" },
  ar: { label: "Arabic", native: "العربية", bcp47: "ar-XA", dir: "rtl" },
  tl: { label: "Tagalog", native: "Tagalog", bcp47: "fil-PH", dir: "ltr" },
  pt: { label: "Portuguese", native: "Português", bcp47: "pt-BR", dir: "ltr" },
  ru: { label: "Russian", native: "Русский", bcp47: "ru-RU", dir: "ltr" },
  fr: { label: "French", native: "Français", bcp47: "fr-FR", dir: "ltr" },
} as const;

export type Locale = keyof typeof LOCALES;
export const LOCALE_KEYS = Object.keys(LOCALES) as Locale[];

type Vars = Record<string, string | number>;

const fill = (template: string, vars: Vars = {}) =>
  template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

/**
 * Strings the ENGINE generates (not transcribed speech). Every locale carries
 * the same keys; a missing key falls back to English rather than showing a
 * placeholder to a patient.
 */
const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    consentTitle: "Before we start",
    consentBody:
      "I'll record this so it can go in your chart. Only your care team sees it. You can skip any question or stop at any time.",
    consentBullet1: "Recorded so it can go in your chart",
    consentBullet2: "Only your care team sees it",
    consentBullet3: "You can skip any question, or stop at any time",
    consentAccept: "That's okay — start",
    opening: "Thanks. So — what's going on that brought you in?",
    askDrugTiming:
      "That helps. One thing I want to check — and it may be nothing. Your record shows you started {drug} about {weeks} weeks ago. Is that right?",
    askDistribution: "Where exactly is it — and has it spread since it started?",
    askQuality: "Is it itchy, painful, or neither?",
    askAssociated: "Have you noticed anything else at all — even something that seems unrelated?",
    askOnsetPrecision: "Take your best guess — closer to two days or closer to a week?",
    escalateGeneric: "I'd like someone from the office to call you today rather than waiting for your appointment.",
    escalateUrgent: "That needs attention right now. Please call 911 or go to an emergency room.",
    holdDose: "Please don't take another dose until you've spoken with them.",
    reconIntro: "Before we finish — let me confirm your medication list. It shows {drugs}. Are you taking all of them?",
    reconAck: "Good to know — I'll flag that so your doctor can update it. I'm not able to change your list myself.",
    doorknob: "Last thing — is there anything else you were hoping to bring up? Even if it seems small.",
    doorknobAck: "Thank you for telling me. I've put that at the top for your doctor.",
    benefits:
      "Your {plan} is active. You've got about ${remaining} left on your deductible. The office can give you an exact estimate — I can't promise a final number.",
    handoff: "I've put all of this together for your doctor to review. Nothing goes in your chart until they do.",
    labelHeard: "Here's what I heard",
    labelWhyFlagged: "Why we flagged this",
    labelMeds: "Your medication list",
    labelCoverage: "Your coverage",
    labelDraft: "Everything here is a draft. Nothing goes into your chart until your doctor reviews it.",
    srcPatient: "You told us",
    srcRecord: "From your record",
    srcInferred: "Prologue noticed",
    srcInsurance: "From your insurer",
    calledToday: "We've asked the office to call you today.",
    nurseWillCall: "A nurse will call you.",
    recording: "Recording",
    notRecording: "Not recording",
    speakButton: "Hold to answer",
    stopButton: "Stop",
  },

  es: {
    consentTitle: "Antes de comenzar",
    consentBody:
      "Voy a grabar esto para que quede en su expediente. Solo su equipo médico lo verá. Puede saltar cualquier pregunta o detenerse cuando quiera.",
    consentBullet1: "Se graba para incluirlo en su expediente",
    consentBullet2: "Solo su equipo médico lo ve",
    consentBullet3: "Puede saltar cualquier pregunta o detenerse cuando quiera",
    consentAccept: "Está bien — comenzar",
    opening: "Gracias. Entonces, ¿qué le trae por aquí?",
    askDrugTiming:
      "Eso ayuda. Quiero revisar una cosa, y puede que no sea nada. Su expediente muestra que empezó {drug} hace unas {weeks} semanas. ¿Es correcto?",
    askDistribution: "¿Dónde exactamente está — y se ha extendido desde que empezó?",
    askQuality: "¿Le pica, le duele, o ninguno de los dos?",
    askAssociated: "¿Ha notado algo más — aunque parezca no tener relación?",
    askOnsetPrecision: "Deme su mejor estimación — ¿más cerca de dos días o de una semana?",
    escalateGeneric: "Quiero que alguien de la oficina le llame hoy en lugar de esperar a su cita.",
    escalateUrgent: "Eso necesita atención ahora mismo. Por favor llame al 911 o vaya a una sala de emergencias.",
    holdDose: "Por favor no tome otra dosis hasta que hable con ellos.",
    reconIntro:
      "Antes de terminar, déjeme confirmar su lista de medicamentos. Muestra {drugs}. ¿Está tomando todos?",
    reconAck:
      "Bueno saberlo — lo voy a marcar para que su doctora lo actualice. Yo no puedo cambiar su lista.",
    doorknob: "Una última cosa — ¿hay algo más que quisiera mencionar? Aunque parezca poca cosa.",
    doorknobAck: "Gracias por decírmelo. Lo puse al principio para su doctora.",
    benefits:
      "Su {plan} está activo. Le quedan unos ${remaining} de su deducible. La oficina puede darle un estimado exacto — yo no puedo prometerle una cifra final.",
    handoff:
      "He preparado todo esto para que su doctora lo revise. Nada entra en su expediente hasta que ella lo haga.",
    labelHeard: "Esto es lo que escuché",
    labelWhyFlagged: "Por qué lo marcamos",
    labelMeds: "Su lista de medicamentos",
    labelCoverage: "Su cobertura",
    labelDraft:
      "Todo esto es un borrador. Nada entra en su expediente hasta que su doctora lo revise.",
    srcPatient: "Usted nos dijo",
    srcRecord: "De su expediente",
    srcInferred: "Prologue notó",
    srcInsurance: "De su seguro",
    calledToday: "Le pedimos a la oficina que le llame hoy.",
    nurseWillCall: "Una enfermera le llamará.",
    recording: "Grabando",
    notRecording: "Sin grabar",
    speakButton: "Mantenga para responder",
    stopButton: "Detener",
  },

  zh: {
    consentTitle: "开始之前",
    consentBody:
      "我会录下这段对话并存入您的病历。只有您的医疗团队能看到。您可以跳过任何问题，或随时停止。",
    consentBullet1: "录音将存入您的病历",
    consentBullet2: "只有您的医疗团队能看到",
    consentBullet3: "您可以跳过任何问题，或随时停止",
    consentAccept: "可以 — 开始",
    opening: "谢谢。那么，请告诉我您今天为什么来就诊？",
    askDrugTiming:
      "这很有帮助。有件事我想确认一下，可能没什么问题。您的病历显示您大约 {weeks} 周前开始服用 {drug}。对吗？",
    askDistribution: "具体在哪个部位 — 开始之后有扩散吗？",
    askQuality: "是发痒、疼痛，还是都不是？",
    askAssociated: "您还注意到别的情况吗 — 即使看起来毫无关联？",
    askOnsetPrecision: "请您估计一下 — 更接近两天还是一周？",
    escalateGeneric: "我希望诊所今天就给您打电话，而不是等到预约那天。",
    escalateUrgent: "这需要立即处理。请拨打 911 或前往急诊室。",
    holdDose: "在与他们通话之前，请不要再服用下一剂。",
    reconIntro: "在结束之前，让我确认一下您的用药清单。上面有 {drugs}。这些您都在服用吗？",
    reconAck: "知道了 — 我会标记出来让您的医生更新。我本人无法修改您的用药清单。",
    doorknob: "最后一件事 — 您还有什么想跟医生提起的吗？即使看起来是小事。",
    doorknobAck: "谢谢您告诉我。我已经把这条放在最前面给您的医生看了。",
    benefits:
      "您的 {plan} 是有效的。您的自付额还剩大约 ${remaining}。诊所可以给您准确的估算 — 我无法承诺最终金额。",
    handoff: "我已经把这些整理好交给您的医生审核。在她审核之前，不会进入您的病历。",
    labelHeard: "以下是我听到的内容",
    labelWhyFlagged: "我们标记的原因",
    labelMeds: "您的用药清单",
    labelCoverage: "您的保险",
    labelDraft: "以上均为草稿。在您的医生审核之前，不会进入病历。",
    srcPatient: "您告诉我们",
    srcRecord: "来自您的病历",
    srcInferred: "Prologue 发现",
    srcInsurance: "来自您的保险公司",
    calledToday: "我们已请诊所今天联系您。",
    nurseWillCall: "护士会给您打电话。",
    recording: "录音中",
    notRecording: "未录音",
    speakButton: "按住回答",
    stopButton: "停止",
  },

  vi: {
    consentTitle: "Trước khi bắt đầu",
    consentBody:
      "Tôi sẽ ghi âm để đưa vào hồ sơ của bạn. Chỉ nhóm chăm sóc của bạn xem được. Bạn có thể bỏ qua bất kỳ câu hỏi nào hoặc dừng lại bất cứ lúc nào.",
    consentBullet1: "Được ghi âm để đưa vào hồ sơ của bạn",
    consentBullet2: "Chỉ nhóm chăm sóc của bạn xem được",
    consentBullet3: "Bạn có thể bỏ qua câu hỏi hoặc dừng bất cứ lúc nào",
    consentAccept: "Được — bắt đầu",
    opening: "Cảm ơn. Vậy điều gì khiến bạn đến khám hôm nay?",
    askDrugTiming:
      "Điều đó hữu ích. Có một điều tôi muốn kiểm tra — có thể không sao. Hồ sơ cho thấy bạn bắt đầu dùng {drug} khoảng {weeks} tuần trước. Đúng không?",
    askDistribution: "Chính xác là ở đâu — và nó có lan rộng kể từ khi bắt đầu không?",
    askQuality: "Nó ngứa, đau, hay không có cảm giác gì?",
    askAssociated: "Bạn có nhận thấy điều gì khác không — kể cả điều có vẻ không liên quan?",
    askOnsetPrecision: "Hãy ước tính — gần hai ngày hay gần một tuần?",
    escalateGeneric: "Tôi muốn ai đó từ phòng khám gọi cho bạn hôm nay thay vì đợi đến lịch hẹn.",
    escalateUrgent: "Điều đó cần được chú ý ngay. Vui lòng gọi 911 hoặc đến phòng cấp cứu.",
    holdDose: "Vui lòng không uống liều tiếp theo cho đến khi bạn nói chuyện với họ.",
    reconIntro:
      "Trước khi kết thúc — hãy để tôi xác nhận danh sách thuốc của bạn. Nó cho thấy {drugs}. Bạn có đang dùng tất cả không?",
    reconAck:
      "Tốt để biết — tôi sẽ đánh dấu để bác sĩ của bạn cập nhật. Tôi không thể tự thay đổi danh sách.",
    doorknob: "Điều cuối cùng — có gì khác bạn muốn nói với bác sĩ không? Dù có vẻ nhỏ nhặt.",
    doorknobAck: "Cảm ơn bạn đã nói. Tôi đã đưa nó lên đầu cho bác sĩ của bạn.",
    benefits:
      "{plan} của bạn đang hoạt động. Bạn còn khoảng ${remaining} khoản khấu trừ. Phòng khám có thể cho bạn ước tính chính xác — tôi không thể hứa một con số cuối cùng.",
    handoff:
      "Tôi đã tập hợp tất cả để bác sĩ của bạn xem xét. Không có gì vào hồ sơ cho đến khi họ duyệt.",
    labelHeard: "Đây là những gì tôi nghe được",
    labelWhyFlagged: "Lý do chúng tôi đánh dấu",
    labelMeds: "Danh sách thuốc của bạn",
    labelCoverage: "Bảo hiểm của bạn",
    labelDraft: "Tất cả đều là bản nháp. Không có gì vào hồ sơ cho đến khi bác sĩ xem xét.",
    srcPatient: "Bạn đã nói với chúng tôi",
    srcRecord: "Từ hồ sơ của bạn",
    srcInferred: "Prologue nhận thấy",
    srcInsurance: "Từ công ty bảo hiểm",
    calledToday: "Chúng tôi đã yêu cầu phòng khám gọi cho bạn hôm nay.",
    nurseWillCall: "Y tá sẽ gọi cho bạn.",
    recording: "Đang ghi âm",
    notRecording: "Không ghi âm",
    speakButton: "Giữ để trả lời",
    stopButton: "Dừng",
  },

  hi: {
    consentTitle: "शुरू करने से पहले",
    consentBody:
      "मैं इसे रिकॉर्ड करूँगा ताकि यह आपके रिकॉर्ड में जा सके। इसे केवल आपकी देखभाल टीम देखेगी। आप कोई भी सवाल छोड़ सकते हैं या कभी भी रोक सकते हैं।",
    consentBullet1: "आपके रिकॉर्ड में जाने के लिए रिकॉर्ड किया जाता है",
    consentBullet2: "केवल आपकी देखभाल टीम इसे देखती है",
    consentBullet3: "आप कोई भी सवाल छोड़ सकते हैं या रोक सकते हैं",
    consentAccept: "ठीक है — शुरू करें",
    opening: "धन्यवाद। तो बताइए, आप आज किस वजह से आए हैं?",
    askDrugTiming:
      "यह मददगार है। एक बात मैं जाँचना चाहता हूँ — शायद कुछ न हो। आपके रिकॉर्ड में है कि आपने {drug} लगभग {weeks} हफ़्ते पहले शुरू की। क्या यह सही है?",
    askDistribution: "यह ठीक कहाँ है — और शुरू होने के बाद से क्या यह फैला है?",
    askQuality: "क्या इसमें खुजली है, दर्द है, या कुछ नहीं?",
    askAssociated: "क्या आपने और कुछ देखा — भले ही वह असंबंधित लगे?",
    askOnsetPrecision: "अंदाज़ा लगाइए — दो दिन के करीब या एक हफ़्ते के करीब?",
    escalateGeneric: "मैं चाहता हूँ कि क्लिनिक से कोई आज ही आपको फ़ोन करे, अपॉइंटमेंट का इंतज़ार न करें।",
    escalateUrgent: "इस पर अभी ध्यान देने की ज़रूरत है। कृपया 911 पर कॉल करें या आपातकालीन कक्ष जाएँ।",
    holdDose: "उनसे बात करने तक कृपया अगली खुराक न लें।",
    reconIntro:
      "समाप्त करने से पहले — मैं आपकी दवाओं की सूची पक्की कर लूँ। इसमें {drugs} है। क्या आप ये सब ले रहे हैं?",
    reconAck:
      "जानकर अच्छा लगा — मैं इसे चिह्नित कर दूँगा ताकि आपकी डॉक्टर इसे अपडेट करें। मैं खुद सूची नहीं बदल सकता।",
    doorknob: "आख़िरी बात — क्या और कुछ है जो आप डॉक्टर से कहना चाहते थे? भले ही छोटा लगे।",
    doorknobAck: "बताने के लिए धन्यवाद। मैंने इसे आपकी डॉक्टर के लिए सबसे ऊपर रखा है।",
    benefits:
      "आपका {plan} सक्रिय है। आपकी कटौती में लगभग ${remaining} बाकी है। क्लिनिक आपको सटीक अनुमान दे सकता है — मैं अंतिम राशि का वादा नहीं कर सकता।",
    handoff:
      "मैंने यह सब आपकी डॉक्टर की समीक्षा के लिए तैयार किया है। उनकी समीक्षा तक कुछ भी आपके रिकॉर्ड में नहीं जाएगा।",
    labelHeard: "मैंने यह सुना",
    labelWhyFlagged: "हमने इसे क्यों चिह्नित किया",
    labelMeds: "आपकी दवाओं की सूची",
    labelCoverage: "आपका बीमा",
    labelDraft: "यह सब मसौदा है। आपकी डॉक्टर की समीक्षा तक कुछ भी रिकॉर्ड में नहीं जाएगा।",
    srcPatient: "आपने हमें बताया",
    srcRecord: "आपके रिकॉर्ड से",
    srcInferred: "Prologue ने देखा",
    srcInsurance: "आपके बीमा से",
    calledToday: "हमने क्लिनिक से कहा है कि वे आज आपको फ़ोन करें।",
    nurseWillCall: "एक नर्स आपको फ़ोन करेगी।",
    recording: "रिकॉर्डिंग",
    notRecording: "रिकॉर्डिंग नहीं",
    speakButton: "जवाब देने के लिए दबाए रखें",
    stopButton: "रोकें",
  },

  ar: {
    consentTitle: "قبل أن نبدأ",
    consentBody:
      "سأسجل هذه المحادثة لتُضاف إلى ملفك الطبي. فريق الرعاية الخاص بك وحده يطّلع عليها. يمكنك تخطي أي سؤال أو التوقف في أي وقت.",
    consentBullet1: "يتم التسجيل لإضافته إلى ملفك الطبي",
    consentBullet2: "فريق الرعاية الخاص بك وحده يطّلع عليه",
    consentBullet3: "يمكنك تخطي أي سؤال أو التوقف في أي وقت",
    consentAccept: "لا بأس — ابدأ",
    opening: "شكرًا. إذًا، ما الذي أتى بك اليوم؟",
    askDrugTiming:
      "هذا مفيد. هناك أمر أود التحقق منه، وقد لا يكون شيئًا مهمًا. يُظهر ملفك أنك بدأت {drug} قبل حوالي {weeks} أسابيع. هل هذا صحيح؟",
    askDistribution: "أين هو بالضبط — وهل انتشر منذ أن بدأ؟",
    askQuality: "هل يسبب حكة أم ألمًا أم لا هذا ولا ذاك؟",
    askAssociated: "هل لاحظت أي شيء آخر — حتى لو بدا غير مرتبط؟",
    askOnsetPrecision: "خمّن تقريبًا — أقرب إلى يومين أم إلى أسبوع؟",
    escalateGeneric: "أريد أن يتصل بك أحد من العيادة اليوم بدلًا من انتظار موعدك.",
    escalateUrgent: "هذا يحتاج إلى اهتمام فوري. من فضلك اتصل بالرقم 911 أو توجه إلى الطوارئ.",
    holdDose: "من فضلك لا تأخذ الجرعة التالية حتى تتحدث معهم.",
    reconIntro: "قبل أن ننهي — دعني أؤكد قائمة أدويتك. تُظهر {drugs}. هل تتناولها جميعًا؟",
    reconAck: "من الجيد معرفة ذلك — سأشير إليه ليقوم طبيبك بتحديثه. لا يمكنني تغيير القائمة بنفسي.",
    doorknob: "أمر أخير — هل هناك شيء آخر كنت تود ذكره للطبيب؟ حتى لو بدا بسيطًا.",
    doorknobAck: "شكرًا لإخباري. لقد وضعته في المقدمة لطبيبك.",
    benefits:
      "خطتك {plan} فعّالة. تبقّى لديك حوالي ${remaining} من المبلغ المقتطع. يمكن للعيادة أن تعطيك تقديرًا دقيقًا — لا أستطيع أن أعدك برقم نهائي.",
    handoff: "لقد جمعت كل هذا ليراجعه طبيبك. لا شيء يدخل ملفك حتى يراجعه.",
    labelHeard: "هذا ما سمعته",
    labelWhyFlagged: "لماذا أشرنا إلى هذا",
    labelMeds: "قائمة أدويتك",
    labelCoverage: "تغطيتك التأمينية",
    labelDraft: "كل هذا مسودة. لا شيء يدخل ملفك حتى يراجعه طبيبك.",
    srcPatient: "أخبرتنا",
    srcRecord: "من ملفك الطبي",
    srcInferred: "لاحظ Prologue",
    srcInsurance: "من شركة التأمين",
    calledToday: "طلبنا من العيادة الاتصال بك اليوم.",
    nurseWillCall: "ستتصل بك ممرضة.",
    recording: "جارٍ التسجيل",
    notRecording: "التسجيل متوقف",
    speakButton: "اضغط للإجابة",
    stopButton: "إيقاف",
  },

  tl: {
    consentTitle: "Bago tayo magsimula",
    consentBody:
      "Ire-record ko ito para mailagay sa inyong rekord. Ang inyong care team lang ang makakakita. Puwede ninyong laktawan ang kahit anong tanong o tumigil anumang oras.",
    consentBullet1: "Nire-record para mailagay sa inyong rekord",
    consentBullet2: "Ang inyong care team lang ang nakakakita",
    consentBullet3: "Puwedeng laktawan ang tanong o tumigil anumang oras",
    consentAccept: "Ayos lang — magsimula",
    opening: "Salamat. Ano po ang dahilan ng inyong pagpunta ngayon?",
    askDrugTiming:
      "Nakakatulong iyan. May isang bagay akong gustong tingnan — baka wala lang ito. Sa inyong rekord, nagsimula kayo ng {drug} mga {weeks} linggo na ang nakalipas. Tama po ba?",
    askDistribution: "Saan po eksakto — at kumalat na ba mula nang magsimula?",
    askQuality: "Makati po ba, masakit, o wala sa dalawa?",
    askAssociated: "May napansin pa po ba kayong iba — kahit mukhang walang kinalaman?",
    askOnsetPrecision: "Tantiyahin ninyo — mas malapit sa dalawang araw o sa isang linggo?",
    escalateGeneric: "Gusto kong may tumawag sa inyo mula sa klinika ngayong araw, hindi na hintayin ang appointment.",
    escalateUrgent: "Kailangan ito ng agarang atensyon. Tumawag po sa 911 o pumunta sa emergency room.",
    holdDose: "Huwag po munang uminom ng susunod na dose hangga't hindi kayo nakakausap nila.",
    reconIntro:
      "Bago tayo matapos — kumpirmahin natin ang listahan ng inyong gamot. Nakalista ang {drugs}. Iniinom ninyo po ba lahat?",
    reconAck:
      "Mabuti pong malaman — imamarka ko ito para ma-update ng inyong doktor. Hindi ko po mababago ang listahan mismo.",
    doorknob: "Huling bagay — may iba pa po ba kayong gustong sabihin sa doktor? Kahit maliit lang.",
    doorknobAck: "Salamat sa pagsasabi. Inilagay ko po ito sa itaas para sa inyong doktor.",
    benefits:
      "Aktibo po ang inyong {plan}. May natitira pa kayong mga ${remaining} sa deductible. Ang klinika ang makapagbibigay ng eksaktong tantiya — hindi ko po masisiguro ang pinal na halaga.",
    handoff:
      "Naipon ko na po ang lahat para suriin ng inyong doktor. Walang papasok sa rekord hangga't hindi niya nasusuri.",
    labelHeard: "Ito po ang narinig ko",
    labelWhyFlagged: "Bakit namin ito minarkahan",
    labelMeds: "Listahan ng inyong gamot",
    labelCoverage: "Inyong insurance",
    labelDraft: "Draft po ang lahat ng ito. Walang papasok sa rekord hangga't hindi sinusuri ng doktor.",
    srcPatient: "Sinabi ninyo sa amin",
    srcRecord: "Mula sa inyong rekord",
    srcInferred: "Napansin ng Prologue",
    srcInsurance: "Mula sa inyong insurance",
    calledToday: "Hiniling namin sa klinika na tawagan kayo ngayong araw.",
    nurseWillCall: "May nurse na tatawag sa inyo.",
    recording: "Nagre-record",
    notRecording: "Hindi nagre-record",
    speakButton: "Pindutin para sumagot",
    stopButton: "Itigil",
  },

  pt: {
    consentTitle: "Antes de começarmos",
    consentBody:
      "Vou gravar isto para que fique no seu prontuário. Só a sua equipe de saúde verá. Você pode pular qualquer pergunta ou parar a qualquer momento.",
    consentBullet1: "Gravado para constar no seu prontuário",
    consentBullet2: "Só a sua equipe de saúde vê",
    consentBullet3: "Você pode pular qualquer pergunta ou parar quando quiser",
    consentAccept: "Tudo bem — começar",
    opening: "Obrigado. Então, o que trouxe você aqui hoje?",
    askDrugTiming:
      "Isso ajuda. Uma coisa que quero verificar — e pode não ser nada. Seu prontuário mostra que você começou {drug} há cerca de {weeks} semanas. Está correto?",
    askDistribution: "Onde exatamente está — e se espalhou desde que começou?",
    askQuality: "Coça, dói, ou nenhum dos dois?",
    askAssociated: "Notou mais alguma coisa — mesmo que pareça não ter relação?",
    askOnsetPrecision: "Dê o seu melhor palpite — mais perto de dois dias ou de uma semana?",
    escalateGeneric: "Quero que alguém da clínica ligue para você hoje, em vez de esperar a consulta.",
    escalateUrgent: "Isso precisa de atenção agora. Ligue para o 911 ou vá a um pronto-socorro.",
    holdDose: "Por favor, não tome a próxima dose até falar com eles.",
    reconIntro:
      "Antes de terminarmos — deixe-me confirmar sua lista de medicamentos. Mostra {drugs}. Você está tomando todos?",
    reconAck:
      "Bom saber — vou sinalizar para que sua médica atualize. Eu não posso alterar a lista.",
    doorknob: "Última coisa — há mais alguma coisa que gostaria de mencionar? Mesmo que pareça pequena.",
    doorknobAck: "Obrigado por contar. Coloquei isso no topo para a sua médica.",
    benefits:
      "Seu {plan} está ativo. Restam cerca de ${remaining} da sua franquia. A clínica pode dar uma estimativa exata — não posso prometer um valor final.",
    handoff:
      "Reuni tudo isso para a sua médica revisar. Nada entra no seu prontuário até que ela revise.",
    labelHeard: "Foi isto que eu ouvi",
    labelWhyFlagged: "Por que sinalizamos isto",
    labelMeds: "Sua lista de medicamentos",
    labelCoverage: "Sua cobertura",
    labelDraft: "Tudo aqui é rascunho. Nada entra no prontuário até a médica revisar.",
    srcPatient: "Você nos disse",
    srcRecord: "Do seu prontuário",
    srcInferred: "Prologue notou",
    srcInsurance: "Do seu plano",
    calledToday: "Pedimos à clínica que ligue para você hoje.",
    nurseWillCall: "Uma enfermeira vai ligar.",
    recording: "Gravando",
    notRecording: "Sem gravar",
    speakButton: "Segure para responder",
    stopButton: "Parar",
  },

  ru: {
    consentTitle: "Прежде чем начать",
    consentBody:
      "Я запишу этот разговор, чтобы он попал в вашу карту. Его увидит только ваша медицинская команда. Вы можете пропустить любой вопрос или остановиться в любой момент.",
    consentBullet1: "Записывается для внесения в вашу карту",
    consentBullet2: "Видит только ваша медицинская команда",
    consentBullet3: "Можно пропустить вопрос или остановиться в любой момент",
    consentAccept: "Хорошо — начать",
    opening: "Спасибо. Итак, что вас сегодня привело?",
    askDrugTiming:
      "Это помогает. Хочу кое-что уточнить — возможно, это пустяк. В вашей карте указано, что вы начали принимать {drug} около {weeks} недель назад. Верно?",
    askDistribution: "Где именно — и распространилось ли это с начала?",
    askQuality: "Это зудит, болит, или ни то, ни другое?",
    askAssociated: "Заметили ли вы что-нибудь ещё — даже если кажется несвязанным?",
    askOnsetPrecision: "Прикиньте — ближе к двум дням или к неделе?",
    escalateGeneric: "Я хочу, чтобы вам позвонили из клиники сегодня, а не ждать приёма.",
    escalateUrgent: "Это требует внимания прямо сейчас. Позвоните 911 или обратитесь в скорую помощь.",
    holdDose: "Пожалуйста, не принимайте следующую дозу, пока не поговорите с ними.",
    reconIntro:
      "Прежде чем закончить — давайте подтвердим список лекарств. В нём указано {drugs}. Вы принимаете всё это?",
    reconAck:
      "Хорошо, что сказали — я отмечу это, чтобы врач обновил список. Сам я изменить его не могу.",
    doorknob: "Последнее — есть ли что-то ещё, что вы хотели обсудить с врачом? Даже если кажется мелочью.",
    doorknobAck: "Спасибо, что сказали. Я поставил это первым пунктом для вашего врача.",
    benefits:
      "Ваш план {plan} действует. На франшизе осталось около ${remaining}. Точную оценку даст клиника — окончательную сумму я обещать не могу.",
    handoff:
      "Я собрал всё это для проверки вашим врачом. Ничего не попадёт в карту, пока врач не проверит.",
    labelHeard: "Вот что я услышал",
    labelWhyFlagged: "Почему мы это отметили",
    labelMeds: "Ваш список лекарств",
    labelCoverage: "Ваша страховка",
    labelDraft: "Всё это черновик. Ничего не попадёт в карту, пока врач не проверит.",
    srcPatient: "Вы нам сказали",
    srcRecord: "Из вашей карты",
    srcInferred: "Prologue заметил",
    srcInsurance: "От вашей страховой",
    calledToday: "Мы попросили клинику связаться с вами сегодня.",
    nurseWillCall: "Медсестра вам позвонит.",
    recording: "Идёт запись",
    notRecording: "Запись выключена",
    speakButton: "Удерживайте, чтобы ответить",
    stopButton: "Стоп",
  },

  fr: {
    consentTitle: "Avant de commencer",
    consentBody:
      "Je vais enregistrer ceci pour que cela figure dans votre dossier. Seule votre équipe soignante y aura accès. Vous pouvez passer une question ou arrêter à tout moment.",
    consentBullet1: "Enregistré pour figurer dans votre dossier",
    consentBullet2: "Seule votre équipe soignante y a accès",
    consentBullet3: "Vous pouvez passer une question ou arrêter à tout moment",
    consentAccept: "D'accord — commencer",
    opening: "Merci. Alors, qu'est-ce qui vous amène aujourd'hui ?",
    askDrugTiming:
      "C'est utile. Une chose que je veux vérifier — ce n'est peut-être rien. Votre dossier indique que vous avez commencé {drug} il y a environ {weeks} semaines. C'est exact ?",
    askDistribution: "Où exactement — et est-ce que cela s'est étendu depuis le début ?",
    askQuality: "Est-ce que ça démange, ça fait mal, ou ni l'un ni l'autre ?",
    askAssociated: "Avez-vous remarqué autre chose — même si cela semble sans rapport ?",
    askOnsetPrecision: "À votre avis — plutôt deux jours ou plutôt une semaine ?",
    escalateGeneric: "Je souhaite que quelqu'un du cabinet vous appelle aujourd'hui plutôt que d'attendre le rendez-vous.",
    escalateUrgent: "Cela nécessite une attention immédiate. Appelez le 911 ou rendez-vous aux urgences.",
    holdDose: "Ne prenez pas la dose suivante avant de leur avoir parlé.",
    reconIntro:
      "Avant de terminer — confirmons votre liste de médicaments. Elle indique {drugs}. Les prenez-vous tous ?",
    reconAck:
      "Bon à savoir — je vais le signaler pour que votre médecin mette à jour. Je ne peux pas modifier la liste moi-même.",
    doorknob: "Dernière chose — y a-t-il autre chose que vous vouliez aborder ? Même si cela paraît anodin.",
    doorknobAck: "Merci de me l'avoir dit. Je l'ai placé en premier pour votre médecin.",
    benefits:
      "Votre {plan} est actif. Il vous reste environ ${remaining} de franchise. Le cabinet peut vous donner une estimation exacte — je ne peux pas promettre un montant final.",
    handoff:
      "J'ai rassemblé tout cela pour que votre médecin l'examine. Rien n'entre dans votre dossier avant son examen.",
    labelHeard: "Voici ce que j'ai entendu",
    labelWhyFlagged: "Pourquoi nous l'avons signalé",
    labelMeds: "Votre liste de médicaments",
    labelCoverage: "Votre couverture",
    labelDraft: "Tout ceci est un brouillon. Rien n'entre au dossier avant l'examen du médecin.",
    srcPatient: "Vous nous avez dit",
    srcRecord: "De votre dossier",
    srcInferred: "Prologue a remarqué",
    srcInsurance: "De votre assurance",
    calledToday: "Nous avons demandé au cabinet de vous appeler aujourd'hui.",
    nurseWillCall: "Une infirmière vous appellera.",
    recording: "Enregistrement",
    notRecording: "Pas d'enregistrement",
    speakButton: "Maintenez pour répondre",
    stopButton: "Arrêter",
  },
};

/** Translate a key, filling {vars}. Falls back to English rather than showing a key. */
export function t(locale: Locale, key: string, vars: Vars = {}): string {
  const template = STRINGS[locale]?.[key] ?? STRINGS.en[key];
  if (!template) {
    console.warn(`[i18n] missing key "${key}"`);
    return "";
  }
  return fill(template, vars);
}

export const isRTL = (locale: Locale) => LOCALES[locale].dir === "rtl";

/**
 * System instruction for Gemini Live.
 *
 * Native audio models pick the language automatically and do NOT accept an
 * explicit language code — so language is steered here, in the prompt, and the
 * model may switch mid-conversation if the patient does.
 *
 * The clinical boundary is restated here because the model is generating speech
 * the patient hears directly.
 */
export function systemInstruction(locale: Locale, chartSummary: string): string {
  const lang = LOCALES[locale];
  return `You are Prologue, a pre-visit intake assistant for a medical clinic. You are NOT a doctor.

LANGUAGE
Speak ${lang.label} (${lang.native}). If the patient switches to another language, follow them
immediately and continue in that language. Never comment on their accent or fluency.

WHAT YOU MAY DO
- Ask about symptoms: onset, location, spread, quality, associated symptoms.
- Confirm medications the patient is taking or has stopped.
- Read back what you heard and let the patient correct it.
- Acknowledge briefly. Keep turns short — one or two sentences.

WHAT YOU MUST NEVER DO
- Never name a diagnosis or a condition. Not even a possibility. Not even if asked directly.
- Never advise starting, stopping, or changing a medication or dose.
- Never state or estimate a total cost.
- Never claim anything is in the patient's chart — everything is a draft for their clinician.
If asked "what do you think it is", say that is exactly what the doctor will determine, and that
your job is to make sure they have the full picture beforehand.

SAFETY
If the patient reports trouble breathing, throat tightness, blistering or peeling skin, or sores
in the mouth or eyes, stop the routine questions immediately and tell them someone from the clinic
will call today. For breathing difficulty, tell them to call 911.

TONE
Warm, unhurried, plainly not a doctor. Say WHY before asking anything sensitive. Tolerate silence.
Never ask two questions in a row without acknowledging the answer.

THE PATIENT'S CHART (use this to ask better questions; never read it aloud verbatim)
${chartSummary}`;
}
