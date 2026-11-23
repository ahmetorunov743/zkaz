/* =====================================================================
   NXT MUSEUM — PROJECT DATA (one object = one picture on the wall)
   ---------------------------------------------------------------------
   To add a project: copy an object, change the fields, put photos into
   assets/images/ and list them in "images". The corridor grows by itself.

     id          unique number or string
     title       string OR { en, ru, ar }
     location    string OR { en, ru, ar }   (Dubai district)
     workType    fitout | renovation | marble | tile | parquet | metal | glass
     year        number
     area        number, m²
     description string OR { en, ru, ar }
     images      ["assets/images/villa-1.jpg", ...]  first one hangs on the wall.
                 Empty array = a generated placeholder picture.

   Note: browsers block WebGL from reading photos opened via file://.
   Real photos therefore show on the wall when the site is served
   (GitHub Pages or any web server). From file:// the wall falls back to a
   placeholder, while the info panel still shows the real photos.

   Below: 30 DEMO placeholders — delete them when real projects arrive.
   ===================================================================== */
window.NXT_PROJECTS = [
  {
    id: 1,
    title: {"en": "Corporate Office No. 01", "ru": "Офис компании № 01", "ar": "مكتب شركة رقم 01"},
    location: {"en": "MBR City", "ru": "MBR Сити", "ar": "مدينة محمد بن راشد"},
    workType: "renovation",
    year: 2023,
    area: 1250,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 2,
    title: {"en": "Showroom No. 02", "ru": "Шоурум № 02", "ar": "صالة عرض رقم 02"},
    location: {"en": "MBR City", "ru": "MBR Сити", "ar": "مدينة محمد بن راشد"},
    workType: "marble",
    year: 2023,
    area: 545,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 3,
    title: {"en": "Art Gallery No. 03", "ru": "Арт-галерея № 03", "ar": "معرض فني رقم 03"},
    location: {"en": "Al Barari", "ru": "Аль-Барари", "ar": "البراري"},
    workType: "tile",
    year: 2023,
    area: 1275,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 4,
    title: {"en": "Residence No. 04", "ru": "Резиденция № 04", "ar": "مسكن رقم 04"},
    location: {"en": "Al Barari", "ru": "Аль-Барари", "ar": "البراري"},
    workType: "parquet",
    year: 2016,
    area: 1200,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 5,
    title: {"en": "Restaurant No. 05", "ru": "Ресторан № 05", "ar": "مطعم رقم 05"},
    location: {"en": "Jumeirah Golf Estates", "ru": "Джумейра Гольф Эстейтс", "ar": "عقارات جميرا للجولف"},
    workType: "metal",
    year: 2017,
    area: 290,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 6,
    title: {"en": "Clinic No. 06", "ru": "Клиника № 06", "ar": "عيادة رقم 06"},
    location: {"en": "Emirates Hills", "ru": "Эмирейтс-Хиллз", "ar": "تلال الإمارات"},
    workType: "glass",
    year: 2024,
    area: 1070,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 7,
    title: {"en": "Penthouse No. 07", "ru": "Пентхаус № 07", "ar": "بنتهاوس رقم 07"},
    location: {"en": "MBR City", "ru": "MBR Сити", "ar": "مدينة محمد بن راشد"},
    workType: "fitout",
    year: 2025,
    area: 460,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 8,
    title: {"en": "Boutique No. 08", "ru": "Бутик № 08", "ar": "بوتيك رقم 08"},
    location: {"en": "Palm Jumeirah", "ru": "Пальм-Джумейра", "ar": "نخلة جميرا"},
    workType: "renovation",
    year: 2023,
    area: 220,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 9,
    title: {"en": "Apartment No. 09", "ru": "Апартаменты № 09", "ar": "شقة رقم 09"},
    location: {"en": "Emirates Hills", "ru": "Эмирейтс-Хиллз", "ar": "تلال الإمارات"},
    workType: "marble",
    year: 2015,
    area: 545,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 10,
    title: {"en": "Private Villa No. 10", "ru": "Частная вилла № 10", "ar": "فيلا خاصة رقم 10"},
    location: {"en": "Business Bay", "ru": "Бизнес-Бэй", "ar": "الخليج التجاري"},
    workType: "tile",
    year: 2024,
    area: 135,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 11,
    title: {"en": "Corporate Office No. 11", "ru": "Офис компании № 11", "ar": "مكتب شركة رقم 11"},
    location: {"en": "MBR City", "ru": "MBR Сити", "ar": "مدينة محمد بن راشد"},
    workType: "parquet",
    year: 2020,
    area: 1185,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 12,
    title: {"en": "Showroom No. 12", "ru": "Шоурум № 12", "ar": "صالة عرض رقم 12"},
    location: {"en": "Dubai Hills Estate", "ru": "Дубай Хиллз", "ar": "دبي هيلز استيت"},
    workType: "metal",
    year: 2023,
    area: 655,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 13,
    title: {"en": "Art Gallery No. 13", "ru": "Арт-галерея № 13", "ar": "معرض فني رقم 13"},
    location: {"en": "Jumeirah Golf Estates", "ru": "Джумейра Гольф Эстейтс", "ar": "عقارات جميرا للجولف"},
    workType: "glass",
    year: 2022,
    area: 70,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 14,
    title: {"en": "Residence No. 14", "ru": "Резиденция № 14", "ar": "مسكن رقم 14"},
    location: {"en": "Downtown Dubai", "ru": "Даунтаун Дубай", "ar": "وسط مدينة دبي"},
    workType: "fitout",
    year: 2022,
    area: 770,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 15,
    title: {"en": "Restaurant No. 15", "ru": "Ресторан № 15", "ar": "مطعم رقم 15"},
    location: {"en": "Umm Suqeim", "ru": "Умм-Сукейм", "ar": "أم سقيم"},
    workType: "renovation",
    year: 2023,
    area: 270,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 16,
    title: {"en": "Clinic No. 16", "ru": "Клиника № 16", "ar": "عيادة رقم 16"},
    location: {"en": "DIFC", "ru": "DIFC", "ar": "مركز دبي المالي العالمي"},
    workType: "marble",
    year: 2020,
    area: 645,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 17,
    title: {"en": "Penthouse No. 17", "ru": "Пентхаус № 17", "ar": "بنتهاوس رقم 17"},
    location: {"en": "Jumeirah Golf Estates", "ru": "Джумейра Гольф Эстейтс", "ar": "عقارات جميرا للجولف"},
    workType: "tile",
    year: 2015,
    area: 235,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 18,
    title: {"en": "Boutique No. 18", "ru": "Бутик № 18", "ar": "بوتيك رقم 18"},
    location: {"en": "Dubai Marina", "ru": "Дубай Марина", "ar": "دبي مارينا"},
    workType: "parquet",
    year: 2021,
    area: 335,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 19,
    title: {"en": "Apartment No. 19", "ru": "Апартаменты № 19", "ar": "شقة رقم 19"},
    location: {"en": "Jumeirah Golf Estates", "ru": "Джумейра Гольф Эстейтс", "ar": "عقارات جميرا للجولف"},
    workType: "metal",
    year: 2021,
    area: 230,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 20,
    title: {"en": "Private Villa No. 20", "ru": "Частная вилла № 20", "ar": "فيلا خاصة رقم 20"},
    location: {"en": "Palm Jumeirah", "ru": "Пальм-Джумейра", "ar": "نخلة جميرا"},
    workType: "glass",
    year: 2025,
    area: 60,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 21,
    title: {"en": "Corporate Office No. 21", "ru": "Офис компании № 21", "ar": "مكتب شركة رقم 21"},
    location: {"en": "Dubai Hills Estate", "ru": "Дубай Хиллз", "ar": "دبي هيلز استيت"},
    workType: "fitout",
    year: 2018,
    area: 190,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 22,
    title: {"en": "Showroom No. 22", "ru": "Шоурум № 22", "ar": "صالة عرض رقم 22"},
    location: {"en": "Tilal Al Ghaf", "ru": "Тилал-аль-Гаф", "ar": "تلال الغاف"},
    workType: "renovation",
    year: 2021,
    area: 1075,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 23,
    title: {"en": "Art Gallery No. 23", "ru": "Арт-галерея № 23", "ar": "معرض فني رقم 23"},
    location: {"en": "Umm Suqeim", "ru": "Умм-Сукейм", "ar": "أم سقيم"},
    workType: "marble",
    year: 2016,
    area: 565,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 24,
    title: {"en": "Residence No. 24", "ru": "Резиденция № 24", "ar": "مسكن رقم 24"},
    location: {"en": "DIFC", "ru": "DIFC", "ar": "مركز دبي المالي العالمي"},
    workType: "tile",
    year: 2020,
    area: 280,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 25,
    title: {"en": "Restaurant No. 25", "ru": "Ресторан № 25", "ar": "مطعم رقم 25"},
    location: {"en": "Jumeirah Golf Estates", "ru": "Джумейра Гольф Эстейтс", "ar": "عقارات جميرا للجولف"},
    workType: "parquet",
    year: 2020,
    area: 95,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 26,
    title: {"en": "Clinic No. 26", "ru": "Клиника № 26", "ar": "عيادة رقم 26"},
    location: {"en": "Umm Suqeim", "ru": "Умм-Сукейм", "ar": "أم سقيم"},
    workType: "metal",
    year: 2016,
    area: 400,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 27,
    title: {"en": "Penthouse No. 27", "ru": "Пентхаус № 27", "ar": "بنتهاوس رقم 27"},
    location: {"en": "Business Bay", "ru": "Бизнес-Бэй", "ar": "الخليج التجاري"},
    workType: "glass",
    year: 2026,
    area: 315,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 28,
    title: {"en": "Boutique No. 28", "ru": "Бутик № 28", "ar": "بوتيك رقم 28"},
    location: {"en": "Palm Jumeirah", "ru": "Пальм-Джумейра", "ar": "نخلة جميرا"},
    workType: "fitout",
    year: 2015,
    area: 1250,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 29,
    title: {"en": "Apartment No. 29", "ru": "Апартаменты № 29", "ar": "شقة رقم 29"},
    location: {"en": "Tilal Al Ghaf", "ru": "Тилал-аль-Гаф", "ar": "تلال الغاف"},
    workType: "renovation",
    year: 2017,
    area: 540,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  },
  {
    id: 30,
    title: {"en": "Private Villa No. 30", "ru": "Частная вилла № 30", "ar": "فيلا خاصة رقم 30"},
    location: {"en": "MBR City", "ru": "MBR Сити", "ar": "مدينة محمد بن راشد"},
    workType: "marble",
    year: 2023,
    area: 545,
    description: {"en": "Placeholder description. A short summary of the scope, materials and the result will go here: two or three calm sentences for the client.", "ru": "Описание-заглушка. Здесь будет короткий рассказ об объёме работ, материалах и результате: две-три спокойные фразы для клиента.", "ar": "وصف مؤقت. هنا سيظهر ملخص قصير عن نطاق الأعمال والمواد والنتيجة: جملتان أو ثلاث جمل هادئة للعميل."},
    images: []
  }
];
