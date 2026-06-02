const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../lib/i18n/locales');

const keys = {
  en: {
    summary: {
      targetCaloriesLabel: 'Your target calories',
      maintenanceCut: 'Maintenance ~{{maintenance}} kcal · {{amount}} kcal deficit',
      maintenanceBulk: 'Maintenance ~{{maintenance}} kcal · +{{amount}} kcal surplus',
      maintenanceRecomp: 'Maintenance calories · body recomposition',
      macroBreakdownNote: 'Full macro breakdown will appear in the Nutrition tab after setup.',
      rows: {
        goal: 'Goal', training: 'Training', physique: 'Physique',
        activity: 'Activity', target: 'Target', pace: 'Pace',
        currentWeightNow: '{{weight}} {{unit}} now',
      },
      deficitPace: '{{pace}} — {{amount}} kcal deficit',
      surplusPace: '{{pace}} — +{{amount}} kcal surplus',
    },
    paywall: {
      features: {
        arpo: 'ARPO auto-progression — weights adjust every session',
        doubleProgression: 'Double Progression mode for strength-focused blocks',
        myoreps: 'Myo-rep sets — more effective reps, less time',
        restTimer: 'Smart 3-tier rest timer calibrated per movement',
        calories: 'Personalised calories & macro targets',
        bodyComp: 'Body composition & FFMI tracking',
        recovery: 'Recovery Intelligence from Apple Health / Health Connect',
        volume: 'Volume landmarks & muscle progress charts',
      },
      foundingPriceHeading: 'Founding member price — first {{count}} only',
      regularPriceLabel: 'Regular price',
      oneTime: 'one-time · yours forever',
      foundingBadge: 'Founding member price · First {{count}} only',
    },
  },
  es: {
    summary: {
      targetCaloriesLabel: 'Tus calorías objetivo',
      maintenanceCut: 'Mantenimiento ~{{maintenance}} kcal · déficit de {{amount}} kcal',
      maintenanceBulk: 'Mantenimiento ~{{maintenance}} kcal · +{{amount}} kcal superávit',
      maintenanceRecomp: 'Calorías de mantenimiento · recomposición corporal',
      macroBreakdownNote: 'El desglose completo de macros aparecerá en la pestaña Nutrición tras la configuración.',
      rows: {
        goal: 'Objetivo', training: 'Entrenamiento', physique: 'Físico',
        activity: 'Actividad', target: 'Meta', pace: 'Ritmo',
        currentWeightNow: '{{weight}} {{unit}} ahora',
      },
      deficitPace: '{{pace}} — déficit de {{amount}} kcal',
      surplusPace: '{{pace}} — +{{amount}} kcal superávit',
    },
    paywall: {
      features: {
        arpo: 'Progresión automática ARPO — los pesos se ajustan en cada sesión',
        doubleProgression: 'Modo de progresión doble para bloques de fuerza',
        myoreps: 'Series Myo-rep — repeticiones más efectivas en menos tiempo',
        restTimer: 'Temporizador de descanso inteligente de 3 niveles',
        calories: 'Calorías y macros personalizados',
        bodyComp: 'Composición corporal y rastreo de FFMI',
        recovery: 'Inteligencia de recuperación de Apple Health / Health Connect',
        volume: 'Hitos de volumen y gráficos de progreso muscular',
      },
      foundingPriceHeading: 'Precio de miembro fundador — solo los primeros {{count}}',
      regularPriceLabel: 'Precio regular',
      oneTime: 'único pago · tuyo para siempre',
      foundingBadge: 'Precio de miembro fundador · Solo los primeros {{count}}',
    },
  },
  ar: {
    summary: {
      targetCaloriesLabel: 'سعراتك الحرارية المستهدفة',
      maintenanceCut: 'الصيانة ~{{maintenance}} سعرة · عجز {{amount}} سعرة',
      maintenanceBulk: 'الصيانة ~{{maintenance}} سعرة · +{{amount}} سعرة فائض',
      maintenanceRecomp: 'سعرات الصيانة · إعادة تركيب الجسم',
      macroBreakdownNote: 'سيظهر التوزيع الكامل للمغذيات في تبويب التغذية بعد الإعداد.',
      rows: {
        goal: 'الهدف', training: 'التدريب', physique: 'البنية',
        activity: 'النشاط', target: 'المستهدف', pace: 'الوتيرة',
        currentWeightNow: '{{weight}} {{unit}} الآن',
      },
      deficitPace: '{{pace}} — عجز {{amount}} سعرة',
      surplusPace: '{{pace}} — +{{amount}} سعرة فائض',
    },
    paywall: {
      features: {
        arpo: 'تقدم تلقائي ARPO — تتعدل الأوزان في كل جلسة',
        doubleProgression: 'وضع التقدم المزدوج لمراحل التركيز على القوة',
        myoreps: 'مجموعات ميو-ريب — تكرارات أكثر فعالية في وقت أقل',
        restTimer: 'مؤقت راحة ذكي بثلاث مراحل معيَّر لكل تمرين',
        calories: 'أهداف السعرات والمغذيات المخصصة',
        bodyComp: 'تتبع تركيبة الجسم ومؤشر FFMI',
        recovery: 'ذكاء التعافي من Apple Health / Health Connect',
        volume: 'معالم الحجم ورسوم بيانية للتقدم العضلي',
      },
      foundingPriceHeading: 'سعر العضو المؤسس — أول {{count}} فقط',
      regularPriceLabel: 'السعر العادي',
      oneTime: 'دفعة واحدة · ملكك إلى الأبد',
      foundingBadge: 'سعر العضو المؤسس · أول {{count}} فقط',
    },
  },
  zh: {
    summary: {
      targetCaloriesLabel: '你的目标卡路里',
      maintenanceCut: '维持热量 ~{{maintenance}} 千卡 · 亏缺 {{amount}} 千卡',
      maintenanceBulk: '维持热量 ~{{maintenance}} 千卡 · +{{amount}} 千卡盈余',
      maintenanceRecomp: '维持热量 · 身体重组',
      macroBreakdownNote: '完整的宏量营养素分解将在设置完成后显示在营养选项卡中。',
      rows: {
        goal: '目标', training: '训练', physique: '体型',
        activity: '活动量', target: '目标体重', pace: '节奏',
        currentWeightNow: '目前 {{weight}} {{unit}}',
      },
      deficitPace: '{{pace}} — 亏缺 {{amount}} 千卡',
      surplusPace: '{{pace}} — +{{amount}} 千卡盈余',
    },
    paywall: {
      features: {
        arpo: 'ARPO 自动进阶 — 每次训练自动调整重量',
        doubleProgression: '双重进阶模式，适合力量训练阶段',
        myoreps: '肌肌组次 — 更高效的次数，节省时间',
        restTimer: '智能三级休息计时器，按动作类型校准',
        calories: '个性化卡路里与宏量营养素目标',
        bodyComp: '体脂成分与FFMI追踪',
        recovery: '来自 Apple Health / Health Connect 的恢复智能',
        volume: '训练量里程碑与肌肉进度图表',
      },
      foundingPriceHeading: '创始会员价格 — 仅限前 {{count}} 名',
      regularPriceLabel: '原价',
      oneTime: '一次性付款 · 永久拥有',
      foundingBadge: '创始会员价格 · 仅限前 {{count}} 名',
    },
  },
  pt: {
    summary: {
      targetCaloriesLabel: 'Suas calorias alvo',
      maintenanceCut: 'Manutenção ~{{maintenance}} kcal · déficit de {{amount}} kcal',
      maintenanceBulk: 'Manutenção ~{{maintenance}} kcal · +{{amount}} kcal superávit',
      maintenanceRecomp: 'Calorias de manutenção · recomposição corporal',
      macroBreakdownNote: 'O detalhamento completo de macros aparecerá na aba Nutrição após a configuração.',
      rows: {
        goal: 'Objetivo', training: 'Treino', physique: 'Físico',
        activity: 'Atividade', target: 'Meta', pace: 'Ritmo',
        currentWeightNow: '{{weight}} {{unit}} agora',
      },
      deficitPace: '{{pace}} — déficit de {{amount}} kcal',
      surplusPace: '{{pace}} — +{{amount}} kcal superávit',
    },
    paywall: {
      features: {
        arpo: 'Progressão automática ARPO — pesos ajustados a cada sessão',
        doubleProgression: 'Modo de progressão dupla para blocos de força',
        myoreps: 'Séries myo-rep — repetições mais eficientes em menos tempo',
        restTimer: 'Temporizador de descanso inteligente de 3 níveis',
        calories: 'Calorias e metas de macros personalizadas',
        bodyComp: 'Composição corporal e rastreamento de FFMI',
        recovery: 'Inteligência de recuperação do Apple Health / Health Connect',
        volume: 'Marcos de volume e gráficos de progresso muscular',
      },
      foundingPriceHeading: 'Preço de membro fundador — apenas os primeiros {{count}}',
      regularPriceLabel: 'Preço regular',
      oneTime: 'pagamento único · seu para sempre',
      foundingBadge: 'Preço de membro fundador · Apenas os primeiros {{count}}',
    },
  },
  sw: {
    summary: {
      targetCaloriesLabel: 'Kalori yako ya lengo',
      maintenanceCut: 'Matengenezo ~{{maintenance}} kcal · upungufu wa {{amount}} kcal',
      maintenanceBulk: 'Matengenezo ~{{maintenance}} kcal · +{{amount}} kcal ziada',
      maintenanceRecomp: 'Kalori za matengenezo · uundaji upya wa mwili',
      macroBreakdownNote: 'Muhtasari kamili wa virutubisho utaonekana kwenye kichupo cha Lishe baada ya usanidi.',
      rows: {
        goal: 'Lengo', training: 'Mafunzo', physique: 'Muundo',
        activity: 'Shughuli', target: 'Shabaha', pace: 'Kasi',
        currentWeightNow: '{{weight}} {{unit}} sasa',
      },
      deficitPace: '{{pace}} — upungufu wa {{amount}} kcal',
      surplusPace: '{{pace}} — +{{amount}} kcal ziada',
    },
    paywall: {
      features: {
        arpo: 'Maendeleo ya moja kwa moja ARPO — uzito unabadilika kila kikao',
        doubleProgression: 'Hali ya maendeleo mara mbili kwa vizuizi vya nguvu',
        myoreps: 'Seti za Myo-rep — marudio bora zaidi, muda mfupi',
        restTimer: 'Kipima muda cha mapumziko cha akili chenye viwango 3',
        calories: 'Malengo ya kalori na lishe yaliyobinafsishwa',
        bodyComp: 'Ufuatiliaji wa muundo wa mwili na FFMI',
        recovery: 'Akili ya kupumzika kutoka Apple Health / Health Connect',
        volume: 'Alama za kiasi na chati za maendeleo ya misuli',
      },
      foundingPriceHeading: 'Bei ya mwanachama mwanzilishi — wa kwanza {{count}} tu',
      regularPriceLabel: 'Bei ya kawaida',
      oneTime: 'malipo moja · yako milele',
      foundingBadge: 'Bei ya mwanzilishi · Wa kwanza {{count}} tu',
    },
  },
};

for (const [lang, data] of Object.entries(keys)) {
  const filePath = path.join(dir, lang + '.json');
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // onboarding.summary additions
  Object.assign(json.onboarding.summary, data.summary);

  // paywall additions
  Object.assign(json.paywall, data.paywall);

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2), { encoding: 'utf8' });
  console.log('Updated', lang + '.json');
}
console.log('All done.');
