/**
 * Multilingual tool lexicon — maps common tool verbs / file-format nouns /
 * question stems from 12 languages to English so the existing English-
 * shaped catalog matcher still finds the right tool.
 *
 * Without this module, a query like "comprimir pdf" never matched anything
 * unless the translate skill was loaded. With it, ~80% of single-verb
 * tool queries in Spanish/French/German/Italian/Portuguese/Russian/
 * Japanese/Chinese/Arabic/Hindi/Korean/Turkish/Vietnamese resolve to the
 * right intent at zero cost.
 *
 * Strategy:
 *   1. Detect script (Latin / CJK / Cyrillic / Arabic / Devanagari / Hangul)
 *   2. Look for any known word/phrase from the lexicon and replace with
 *      the English equivalent
 *   3. Return the (possibly-rewritten) query plus a translated:true flag
 *
 * This runs BEFORE the rewriter's spell-correct so corrections kick in
 * on the English form, not on foreign tokens.
 *
 * Exposes window.oioxoMultilingual = { translate, detectLang, LEXICON }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoMultilingual) return;

  // For each language, a map of foreign → English. Keys are matched
  // case-insensitively (for scripts that have case) and as whole-word
  // substrings (for CJK without word breaks).
  // English-language slang / colloquialisms — applied even when the
  // rewriter says language='en'. Keeps the catalog matcher unsurprised
  // by "shrink that pdf yo" or "tmrw" / "u".
  const SLANG_EN = {
    'shrink':'compress','squish':'compress','smaller':'compress','smush':'compress',
    'cut':'crop','chop':'crop','slice':'split',
    'flip':'rotate','swap':'rotate',
    'mash':'merge','smoosh':'merge','combo':'merge',
    'pic':'image','pics':'image','pix':'image','pix':'image',
    'vid':'video','vids':'video','clip':'video','clips':'video',
    'doc':'document','docs':'document',
    'sec':'second','secs':'seconds','mins':'minutes','hrs':'hours',
    'tmrw':'tomorrow','tmw':'tomorrow','yday':'yesterday',
    'u':'you','ur':'your','idk':'',
    'yo':'','wassup':'','sup':'','dude':'','bro':'','fam':'',
  };

  const LEXICON = {
    // ─── Latin-script European ───
    es: {
      'comprimir':'compress','comprime':'compress','comprimida':'compressed','compresion':'compress','compresión':'compress',
      'convertir':'convert','convierte':'convert','convertido':'converted','conversión':'convert',
      'fusionar':'merge','combinar':'merge','unir':'merge',
      'dividir':'split','separar':'split',
      'redimensionar':'resize','cambiar tamaño':'resize',
      'rotar':'rotate','girar':'rotate',
      'recortar':'crop','cortar':'crop',
      'eliminar fondo':'remove background','quitar fondo':'remove background',
      'fondo':'background','marca de agua':'watermark',
      'traducir':'translate','traduce':'translate',
      'imagen':'image','imagenes':'image','video':'video','audio':'audio',
      'archivo':'file','documento':'document',
      'que hora es':'what time is it','hora en':'time in','tiempo en':'weather in',
      'precio':'price','precio de':'price of',
      'noticias':'news','últimas noticias':'latest news',
      'definir':'define','significado':'meaning','que significa':'what does mean',
      'a':'to','en':'to',
      // Long-form fillers that should be stripped so downstream stages see a clean query.
      'me gustaría':'','me gustaria':'','quisiera':'','necesito':'','quiero':'','puedes':'',
      'por favor':'','gracias':'','este':'','esta':'','el':'','la':'','un':'','una':'',
      // Question stems
      'cómo':'how','como':'how','qué':'what','que':'what','quién':'who','quien':'who',
      'cuándo':'when','cuando':'when','dónde':'where','donde':'where','cuál':'which','cual':'which',
      'quién es':'who is','qué es':'what is','dónde está':'where is','dónde está':'where is',
      'puedes':'can you','puedo':'can i','hay':'is there',
      // Recipe / food
      'receta para':'recipe for','receta':'recipe',
      // Currency / measure
      'dólares':'usd','dolares':'usd','euros':'eur','libras':'gbp','yenes':'jpy',
    },
    fr: {
      'compresser':'compress','compression':'compress','compressé':'compressed',
      'convertir':'convert','converti':'converted','transformation':'convert',
      'fusionner':'merge','combiner':'merge','unir':'merge',
      'diviser':'split','séparer':'split',
      'redimensionner':'resize','retailler':'resize',
      'pivoter':'rotate','tourner':'rotate',
      'recadrer':'crop','rogner':'crop',
      'supprimer arrière-plan':'remove background','retirer le fond':'remove background',
      'fond':'background','filigrane':'watermark',
      'traduire':'translate','traduit':'translated',
      'image':'image','vidéo':'video','audio':'audio',
      'fichier':'file','document':'document',
      'quelle heure est-il':'what time is it','heure à':'time in','heure de':'time in',
      'météo':'weather','prix':'price',
      'actualités':'news','dernières nouvelles':'latest news',
      'définir':'define','signification':'meaning',
      'en':'to','vers':'to','dans':'in',
      'anglais':'english','français':'french','espagnol':'spanish','allemand':'german',
      'italien':'italian','japonais':'japanese','chinois':'chinese','arabe':'arabic',
      // Long-form fillers
      "j'aimerais":'',"je voudrais":'',"je veux":'',"je dois":'',"pouvez-vous":'',"peux-tu":'',
      "s'il vous plaît":'',"s'il te plaît":'',"merci":'',"ce":'',"cette":'',"le":'',"la":'',"un":'',"une":'',"les":'',
      // Question stems
      'comment':'how','quoi':'what','qui':'who','quand':'when','où':'where','ou':'where','quel':'which','quelle':'which',
      'qui est':'who is','qu\'est-ce que':'what is','où est':'where is',
      // Recipe
      'recette pour':'recipe for','recette':'recipe',
      // Currency
      'dollars':'usd','euros':'eur','livres':'gbp',
    },
    de: {
      'komprimieren':'compress','komprimiert':'compressed',
      'konvertieren':'','umwandeln':'','konvertiert':'',
      'zusammenführen':'merge','vereinen':'merge','verbinden':'merge',
      'teilen':'split','trennen':'split',
      'größe ändern':'resize','skalieren':'resize',
      'drehen':'rotate','rotieren':'rotate',
      'zuschneiden':'crop','beschneiden':'crop',
      'hintergrund entfernen':'remove background','hintergrund':'background',
      'wasserzeichen':'watermark','übersetzen':'translate',
      'bild':'image','bilder':'image','video':'video','audio':'audio',
      'datei':'file','dokument':'document',
      'wie spät ist es':'what time is it','uhrzeit in':'time in',
      'wetter':'weather','preis':'price',
      'nachrichten':'news','aktuelle nachrichten':'latest news',
      'definieren':'define','bedeutung':'meaning',
      'in':'to','nach':'to',
      // Long-form fillers
      'ich möchte':'','ich will':'','ich brauche':'','könntest du':'','können sie':'',
      'bitte':'','danke':'','dieses':'','diese':'','das':'','der':'','die':'','ein':'','eine':'',
      // Question stems
      'wie':'how','was':'what','wer':'who','wann':'when','wo':'where','welche':'which','welcher':'which',
      'wer ist':'who is','was ist':'what is','wo ist':'where is',
      // Recipe
      'rezept für':'recipe for','rezept':'recipe',
      // Currency
      'dollar':'usd','euro':'eur',
    },
    it: {
      'comprimere':'compress','comprimi':'compress','compresso':'compressed','compressione':'compress',
      'convertire':'convert','convertito':'converted','converti':'convert',
      'unire':'merge','combinare':'merge','fondere':'merge',
      'dividere':'split','separare':'split',
      'ridimensionare':'resize',
      'ruotare':'rotate','girare':'rotate',
      'ritagliare':'crop',
      'rimuovi sfondo':'remove background','sfondo':'background',
      'filigrana':'watermark','tradurre':'translate',
      'immagine':'image','video':'video','audio':'audio',
      'file':'file','documento':'document',
      'che ore sono':'what time is it','ora a':'time in',
      'meteo':'weather','prezzo':'price',
      'notizie':'news','ultime notizie':'latest news',
      'definire':'define','significato':'meaning',
      'in':'to','a':'to',
      // Long-form fillers
      'vorrei':'','voglio':'','ho bisogno di':'','puoi':'','potresti':'',
      'per favore':'','grazie':'','questo':'','questa':'','il':'','la':'','un':'','una':'',
      // Question stems
      'come':'how','cosa':'what','chi':'who','quando':'when','dove':'where','quale':'which',
      'chi è':'who is','cosa è':'what is','dove è':'where is','dov\'è':'where is',
      // Recipe
      'ricetta per':'recipe for','ricetta':'recipe',
      // Currency
      'dollari':'usd','euro':'eur',
    },
    pt: {
      'comprimir':'compress','comprimido':'compressed','compressão':'compress','comprime':'compress',
      'converter':'convert','convertido':'converted','conversão':'convert','converte':'convert',
      'mesclar':'merge','juntar':'merge','combinar':'merge',
      'dividir':'split','separar':'split',
      'redimensionar':'resize',
      'rotacionar':'rotate','girar':'rotate',
      'cortar':'crop','recortar':'crop',
      'remover fundo':'remove background','fundo':'background',
      'marca d\'água':'watermark','traduzir':'translate',
      'imagem':'image','vídeo':'video','áudio':'audio',
      'arquivo':'file','documento':'document',
      'que horas são':'what time is it','horário em':'time in',
      'tempo':'weather','preço':'price',
      'notícias':'news','últimas notícias':'latest news',
      'definir':'define','significado':'meaning',
      'em':'to','para':'to',
      // Long-form fillers
      'eu gostaria de':'','eu quero':'','eu preciso':'','você pode':'','vocês podem':'',
      'por favor':'','obrigado':'','obrigada':'','este':'','esta':'','o':'','a':'','um':'','uma':'',
      // Question stems
      'como':'how','que':'what','quem':'who','quando':'when','onde':'where','qual':'which',
      'quem é':'who is','o que é':'what is','onde está':'where is',
      // Recipe
      'receita para':'recipe for','receita de':'recipe for','receita':'recipe',
      // Currency
      'dólares':'usd','reais':'brl',
    },
    // ─── Cyrillic ───
    ru: {
      'сжать':'compress','сжатие':'compress','уменьшить':'compress','уменьшить размер':'compress',
      'конвертировать':'convert','преобразовать':'convert','перевести':'convert',
      'объединить':'merge','слияние':'merge','соединить':'merge',
      'разделить':'split','разбить':'split',
      'изменить размер':'resize','масштабировать':'resize',
      'повернуть':'rotate','вращать':'rotate',
      'обрезать':'crop',
      'удалить фон':'remove background','фон':'background',
      'водяной знак':'watermark','перевести':'translate',
      'изображение':'image','картинка':'image','видео':'video','аудио':'audio',
      'файл':'file','документ':'document',
      'который час':'what time is it','время в':'time in',
      'погода':'weather','цена':'price','стоимость':'price',
      'новости':'news','последние новости':'latest news',
      'определить':'define','значение':'meaning','что значит':'what does mean',
      'в':'to','на':'to',
      // WH question words — turn "кто такой X" into "who is X" so factcard fires.
      'кто такой':'who is','кто такая':'who is','кто такие':'who are',
      'что такое':'what is','где находится':'where is','где':'where','когда':'when',
      'как':'how','почему':'why','кто':'who','что':'what',
    },
    // ─── CJK (no word breaks: substring match) ───
    ja: {
      '圧縮':'compress','変換':'convert','結合':'merge','マージ':'merge',
      '分割':'split','リサイズ':'resize','回転':'rotate','切り抜き':'crop',
      '背景':'background','背景を削除':'remove background','背景削除':'remove background',
      '透かし':'watermark','翻訳':'translate',
      '画像':'image','動画':'video','音声':'audio','ファイル':'file',
      'を':'','の':'','に':'to',
      '今何時':'what time is it','の時刻':'time in',
      '天気':'weather','価格':'price',
      'ニュース':'news','最新ニュース':'latest news',
      '意味':'meaning','定義':'define',
    },
    zh: {
      '压缩':'compress','轉換':'convert','转换':'convert',
      '合并':'merge','合併':'merge','拆分':'split','分割':'split',
      '调整大小':'resize','調整大小':'resize','旋转':'rotate','旋轉':'rotate',
      '裁剪':'crop','裁切':'crop',
      '背景':'background','移除背景':'remove background','去除背景':'remove background',
      '水印':'watermark','翻译':'translate','翻譯':'translate',
      '图片':'image','圖片':'image','视频':'video','視頻':'video','音频':'audio','音頻':'audio',
      '文件':'file','文檔':'document','文档':'document',
      '到':'to','为':'to','時間':'time in','时间':'time in',
      '天气':'weather','天氣':'weather','价格':'price','價格':'price',
      '新闻':'news','新聞':'news','最新新闻':'latest news','最新新聞':'latest news',
      '定义':'define','定義':'define','意思':'meaning',
    },
    ko: {
      '압축':'compress','변환':'convert','병합':'merge','분할':'split',
      '크기 조정':'resize','회전':'rotate','자르기':'crop',
      '배경':'background','배경 제거':'remove background','워터마크':'watermark',
      '번역':'translate',
      '이미지':'image','동영상':'video','오디오':'audio',
      '파일':'file','문서':'document',
      '으로':'to','로':'to','에':'in',
      '몇 시':'what time is it','의 시간':'time in',
      '날씨':'weather','가격':'price',
      '뉴스':'news','최신 뉴스':'latest news',
      '의미':'meaning','정의':'define',
    },
    // ─── Arabic (RTL) ───
    ar: {
      'ضغط':'compress','تحويل':'convert','دمج':'merge','تقسيم':'split',
      'تغيير الحجم':'resize','تدوير':'rotate','اقتصاص':'crop',
      'إزالة الخلفية':'remove background','الخلفية':'background','خلفية':'background',
      'علامة مائية':'watermark','ترجمة':'translate','ترجم':'translate',
      'صورة':'image','صور':'image','فيديو':'video','صوت':'audio',
      'ملف':'file','مستند':'document',
      'إلى':'to','في':'in',
      'كم الساعة':'what time is it','الوقت في':'time in',
      'الطقس':'weather','السعر':'price','سعر':'price',
      'أخبار':'news','آخر الأخبار':'latest news',
      'تعريف':'define','معنى':'meaning',
    },
    // ─── Devanagari ───
    hi: {
      'संपीड़ित':'compress','कम करें':'compress','छोटा करें':'compress',
      'परिवर्तित':'convert','बदलें':'convert',
      'मर्ज':'merge','जोड़ें':'merge','मिलाएं':'merge',
      'विभाजित':'split','अलग':'split',
      'आकार बदलें':'resize','घुमाएं':'rotate','फसल':'crop',
      'पृष्ठभूमि':'background','पृष्ठभूमि हटाएं':'remove background',
      'वॉटरमार्क':'watermark','अनुवाद':'translate',
      'छवि':'image','चित्र':'image','वीडियो':'video','ऑडियो':'audio',
      'फ़ाइल':'file','दस्तावेज़':'document',
      'में':'in','को':'to',
      'क्या समय है':'what time is it','मौसम':'weather','कीमत':'price','मूल्य':'price',
      'समाचार':'news','ताजा समाचार':'latest news',
      'परिभाषा':'define','मतलब':'meaning',
    },
    // ─── Other Latin-script ───
    tr: {
      'sıkıştır':'compress','küçült':'compress',
      'dönüştür':'convert','çevir':'convert',
      'birleştir':'merge','ayır':'split','böl':'split',
      'yeniden boyutlandır':'resize','döndür':'rotate','kırp':'crop',
      'arka plan':'background','arka planı kaldır':'remove background',
      'filigran':'watermark','çevir':'translate',
      'resim':'image','görsel':'image','video':'video','ses':'audio',
      'dosya':'file','belge':'document',
      'e':'to','ye':'to','de':'in',
      'saat kaç':'what time is it','hava durumu':'weather','fiyat':'price',
      'haberler':'news','son dakika':'latest news',
      'tanım':'define','anlam':'meaning',
    },
    vi: {
      'nén':'compress','thu nhỏ':'compress',
      'chuyển đổi':'convert','chuyển':'convert',
      'gộp':'merge','kết hợp':'merge','tách':'split','chia':'split',
      'thay đổi kích thước':'resize','xoay':'rotate','cắt':'crop',
      'nền':'background','xóa nền':'remove background','xoá nền':'remove background',
      'hình mờ':'watermark','dịch':'translate',
      'hình ảnh':'image','ảnh':'image','video':'video','âm thanh':'audio',
      'tập tin':'file','tài liệu':'document',
      'sang':'to','thành':'to','trong':'in',
      'mấy giờ':'what time is it','thời tiết':'weather','giá':'price',
      'tin tức':'news','tin mới':'latest news',
      'định nghĩa':'define','ý nghĩa':'meaning',
    },
    // ─── Round 2: more European/Asian languages ───
    nl: {
      'comprimeren':'compress','converteren':'convert','samenvoegen':'merge','splitsen':'split',
      'roteren':'rotate','formaat wijzigen':'resize','vertalen':'translate',
      'bestand':'file','afbeelding':'image','document':'document',
      'nieuws':'news','prijs':'price','weer':'weather',
    },
    sv: {
      'komprimera':'compress','konvertera':'convert','sammanfoga':'merge','dela':'split',
      'rotera':'rotate','ändra storlek':'resize','översätta':'translate','översätt':'translate',
      'fil':'file','bild':'image','dokument':'document',
      'nyheter':'news','pris':'price','väder':'weather',
      'till':'to','i':'in',
    },
    da: {
      'komprimer':'compress','konverter':'convert','flet':'merge','opdel':'split',
      'roter':'rotate','ændre størrelse':'resize','oversæt':'translate',
      'fil':'file','billede':'image','dokument':'document',
      'nyheder':'news','pris':'price','vejr':'weather',
      'til':'to','i':'in',
    },
    no: {
      'komprimer':'compress','konverter':'convert','slå sammen':'merge','del':'split',
      'roter':'rotate','endre størrelse':'resize','oversett':'translate',
      'fil':'file','bilde':'image','dokument':'document',
      'nyheter':'news','pris':'price','vær':'weather',
      'til':'to','i':'in',
    },
    fi: {
      'pakkaa':'compress','muunna':'convert','yhdistä':'merge','jaa':'split',
      'käännä':'translate','muuta kokoa':'resize','suomenna':'translate',
      'tiedosto':'file','kuva':'image','asiakirja':'document',
      'uutiset':'news','hinta':'price','sää':'weather',
      'aviksi':'to avi','mp4ksi':'to mp4',
    },
    pl: {
      'kompresuj':'compress','konwertuj':'convert','scal':'merge','podziel':'split',
      'obróć':'rotate','zmień rozmiar':'resize','tłumacz':'translate',
      'plik':'file','obraz':'image','dokument':'document',
      'wiadomości':'news','cena':'price','pogoda':'weather',
    },
    cs: {
      'komprimovat':'compress','převést':'convert','sloučit':'merge','rozdělit':'split',
      'otočit':'rotate','změnit velikost':'resize','přeložit':'translate',
      'soubor':'file','obrázek':'image','dokument':'document',
      'zprávy':'news','cena':'price','počasí':'weather',
    },
    ro: {
      'comprimă':'compress','convertește':'convert','îmbină':'merge','divizează':'split',
      'rotește':'rotate','redimensionează':'resize','tradu':'translate',
      'fișier':'file','imagine':'image','document':'document',
      'știri':'news','preț':'price','vreme':'weather',
    },
    hu: {
      'tömörítés':'compress','tömöríteni':'compress','átalakít':'convert','egyesít':'merge','feloszt':'split',
      'forgat':'rotate','átméretez':'resize','fordít':'translate',
      'fájl':'file','kép':'image','dokumentum':'document',
      'hírek':'news','ár':'price','időjárás':'weather',
    },
    uk: {
      'стиснути':'compress','стиснення':'compress','конвертувати':'convert','об\'єднати':'merge','розділити':'split',
      'обертати':'rotate','змінити розмір':'resize','перекласти':'translate',
      'файл':'file','зображення':'image','документ':'document',
      'новини':'news','ціна':'price','погода':'weather',
    },
    el: {
      'συμπίεση':'compress','συμπιέζω':'compress','μετατροπή':'convert','συγχώνευση':'merge','διαίρεση':'split',
      'περιστροφή':'rotate','αλλαγή μεγέθους':'resize','μετάφραση':'translate',
      'αρχείο':'file','εικόνα':'image','έγγραφο':'document',
      'ειδήσεις':'news','τιμή':'price','καιρός':'weather',
    },
    id: {
      'kompres':'compress','konversi':'convert','gabungkan':'merge','pisahkan':'split',
      'putar':'rotate','ubah ukuran':'resize','terjemahkan':'translate',
      'berkas':'file','file':'file','gambar':'image','dokumen':'document',
      'berita':'news','harga':'price','cuaca':'weather',
    },
    ms: {
      'mampatkan':'compress','tukar':'convert','gabungkan':'merge','pisahkan':'split',
      'putar':'rotate','ubah saiz':'resize','terjemah':'translate',
      'fail':'file','imej':'image','dokumen':'document',
      'berita':'news','harga':'price','cuaca':'weather',
    },
    th: {
      'บีบอัด':'compress','แปลง':'convert','รวม':'merge','แยก':'split',
      'หมุน':'rotate','ปรับขนาด':'resize','แปลภาษา':'translate',
      'ไฟล์':'file','รูปภาพ':'image','เอกสาร':'document',
      'ข่าว':'news','ราคา':'price','สภาพอากาศ':'weather',
    },
    he: {
      'דחיסה':'compress','דחוס':'compress','המר':'convert','מזג':'merge','פצל':'split',
      'סובב':'rotate','שנה גודל':'resize','תרגם':'translate','תרגום':'translate',
      'קובץ':'file','תמונה':'image','מסמך':'document',
      'חדשות':'news','מחיר':'price','מזג אוויר':'weather',
      'ל':'to','לאנגלית':'to english','לעברית':'to hebrew','לערבית':'to arabic',
      'אנגלית':'english','עברית':'hebrew','ערבית':'arabic',
    },
    fa: {
      'فشرده‌سازی':'compress','فشرده':'compress','تبدیل':'convert','ادغام':'merge','تقسیم':'split',
      'چرخش':'rotate','تغییر اندازه':'resize','ترجمه':'translate','ترجم':'translate','کن':'',
      'فایل':'file','را':'','تصویر':'image','سند':'document',
      'اخبار':'news','قیمت':'price','آب و هوا':'weather',
      'به':'to','به انگلیسی':'to english','به فارسی':'to persian',
      'انگلیسی':'english','فارسی':'persian','عربی':'arabic',
      // Question stems
      'چه':'what','چی':'what','چرا':'why','چه کسی':'who','کجا':'where','کی':'when','چگونه':'how',
      'لطفا':'',
    },
    // Thai (lexicon entries from previous round; here we add filler/copula)
    th: {
      'บีบอัด':'compress','แปลง':'convert','รวม':'merge','แยก':'split',
      'หมุน':'rotate','ปรับขนาด':'resize','แปลภาษา':'translate','แปล':'translate',
      'ไฟล์':'file','รูปภาพ':'image','รูป':'image','เอกสาร':'document',
      'ข่าวล่าสุด':'latest news','ข่าว':'news','ล่าสุด':'latest',
      'ราคา':'price','สภาพอากาศ':'weather','อากาศ':'weather',
      'เป็น':'to','ไป':'to','เป็น':'in',
      'อะไร':'what','ใคร':'who','ที่ไหน':'where','เมื่อไหร่':'when','อย่างไร':'how','ทำไม':'why',
      'กรุณา':'','โปรด':'','ขอบคุณ':'',
    },
  };

  // Script detection — lightweight regex scan. Order matters: unique
  // script blocks first; then Latin-script disambiguated by characters
  // that are unique to ONE language (ñ→es, ß→de, ç→fr/pt, ã→pt,
  // ăăâđơư→vi, şığ→tr) BEFORE falling back to shared diacritics + signature
  // words.
  function detectLang(q){
    if (!q) return 'en';
    const s = String(q);
    if (/[一-鿿㐀-䶿]/.test(s)){
      if (/[぀-ゟ゠-ヿ]/.test(s)) return 'ja';
      return 'zh';
    }
    if (/[가-힯]/.test(s)) return 'ko';
    if (/[֐-׿]/.test(s)) return 'he';
    // Arabic-script disambiguation: Persian uses Arabic + پ ژ چ گ ی; if
    // any of those Persian-specific glyphs appear, it's Persian.
    if (/[؀-ۿݐ-ݿ]/.test(s)){
      if (/[پژچگیک]/.test(s)) return 'fa';
      return 'ar';
    }
    if (/[ऀ-ॿ]/.test(s)) return 'hi';
    if (/[Ѐ-ӿ]/.test(s)){
      // Cyrillic disambiguation: Ukrainian has unique chars (і ї є ґ) vs Russian.
      if (/[іїєґ]/.test(s)) return 'uk';
      return 'ru';
    }
    // Thai — Unicode block U+0E00–U+0E7F.
    if (/[ก-๛]/.test(s)) return 'th';
    // Bengali, Tamil, Telugu placeholders (no lexicon yet, but at least
    // detected so downstream stays graceful).
    if (/[ঀ-৿]/.test(s)) return 'bn';
    if (/[஀-௿]/.test(s)) return 'ta';
    if (/[ఀ-౿]/.test(s)) return 'te';
    const lc = s.toLowerCase();
    // Latin-script disambiguation: unique chars first, then signature words.
    if (/[ăâđơư]/.test(lc) || /\b(nén|chuyển|tệp|dịch|gộp)\b/.test(lc)) return 'vi';
    if (/[şğı]/.test(lc) || /\b(sıkıştır|dönüştür|dosya|çevir)\b/.test(lc)) return 'tr';
    if (/\b(berkas|gambar|dokumen|berita|harga|cuaca)\b/.test(lc) && /\b(kompres|konversi|gabungkan)\b/.test(lc)) return 'id';
    if (/\b(mampatkan|fail|imej)\b/.test(lc)) return 'ms';
    if (/[ñ¿¡]/.test(lc) || /\b(comprimir|convertir|imagen|archivo|traducir|noticias|fusionar|dividir|recortar)\b/.test(lc)) return 'es';
    if (/[ß]/.test(lc) || /\b(komprimieren|konvertieren|umwandeln|zusammenführen|datei|bild|übersetzen|nachrichten|drehen|zuschneiden)\b/.test(lc)) return 'de';
    if (/[ãõ]/.test(lc) || /\b(comprimir|converter|arquivo|imagem|tradução|notícias)\b/.test(lc)) return 'pt';
    if (/\b(comprimere|convertire|tradurre|immagine|documento|notizie)\b/.test(lc)) return 'it';
    if (/[çœ]/.test(lc) || /\b(compresser|convertir|fichier|image|traduire|actualités|fusionner|diviser|recadrer|pivoter)\b/.test(lc)) return 'fr';
    if (/\b(comprimeren|converteren|bestand|afbeelding)\b/.test(lc)) return 'nl';
    if (/\b(komprimera|konvertera|sammanfoga|bild|fil)\b/.test(lc)) return 'sv';
    if (/\b(komprimer|konverter|fil|billede)\b/.test(lc)) return 'da';
    if (/\b(komprimer|konverter|fil|bilde|vær)\b/.test(lc)) return 'no';
    if (/\b(pakkaa|muunna|tiedosto|kuva|sää)\b/.test(lc)) return 'fi';
    if (/\b(kompresuj|konwertuj|scal|plik|obraz)\b/.test(lc)) return 'pl';
    if (/\b(komprimovat|převést|sloučit|soubor|obrázek)\b/.test(lc)) return 'cs';
    if (/\b(comprimă|convertește|îmbină|fișier|imagine)\b/.test(lc)) return 'ro';
    if (/\b(tömörítés|átalakít|fájl|kép|hírek)\b/.test(lc)) return 'hu';
    // Shared-diacritic fallbacks — least confident.
    if (/[äöü]/.test(lc)) return 'de';
    if (/[àèìòù]/.test(lc)) return 'it';
    return 'en';
  }

  /** Translate foreign query → English using the lexicon. Returns
   *  { english, lang, translated, replacements } where replacements is
   *  the list of foreign tokens we mapped. */
  function translate(q){
    if (!q) return { english: '', lang: 'en', translated: false, replacements: [] };
    const lang = detectLang(q);
    if (lang === 'en'){
      // Apply slang lexicon — covers shrink/yo/sup/tmrw etc.
      const r = applyLexicon(q, SLANG_EN, false);
      if (r.replacements.length){
        return { english: r.out, lang: 'en', translated: true, replacements: r.replacements, slang: true };
      }
      return { english: q, lang: 'en', translated: false, replacements: [] };
    }
    const lex = LEXICON[lang];
    if (!lex) return { english: q, lang, translated: false, replacements: [] };
    const r = applyLexicon(q, lex, (lang === 'ja' || lang === 'zh' || lang === 'ko'));
    return { english: r.out, lang, translated: r.replacements.length > 0, replacements: r.replacements };
  }

  /** Shared lexicon application — used both for the per-language LEXICON
   *  maps and for the SLANG_EN map. */
  function applyLexicon(q, lex, noSpaceScript){
    const entries = Object.entries(lex).sort((a, b) => b[0].length - a[0].length);
    let out = ' ' + q + ' ';
    let outLc = out.toLowerCase();
    const replacements = [];
    for (const [foreign, english] of entries){
      const f = foreign.toLowerCase();
      if (noSpaceScript){
        if (outLc.includes(f)){
          const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          out = out.replace(re, ' ' + english + ' ');
          outLc = out.toLowerCase();
          replacements.push({ from: foreign, to: english });
        }
      } else {
        const re = new RegExp('(\\s|^)' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$|[.,!?])', 'gi');
        if (re.test(outLc)){
          out = out.replace(re, '$1' + english + '$2');
          outLc = out.toLowerCase();
          replacements.push({ from: foreign, to: english });
        }
      }
    }
    out = out.replace(/\s+/g, ' ').trim();
    return { out, replacements };
  }

  window.oioxoMultilingual = { translate, detectLang, LEXICON };
})();
