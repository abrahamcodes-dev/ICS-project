/** Bundled educational content only. No network retrieval or patient-specific advice. */
import { CHATBOT_CATEGORIES } from '../constants/chatbotCategories';
import { nutritionKnowledge, NUTRITION_SOURCES } from './nutritionKnowledge';

export const HEALTH_KNOWLEDGE_VERSION = '2026-11-08.1';
export type HealthCategory = typeof CHATBOT_CATEGORIES[number];
export type HealthSource = Readonly<{title: string; organization: 'WHO' | 'FAO' | 'FAO/Government of Kenya' | 'CDC' | 'Health Canada'; url: string; verifiedOn: string; locator?: string}>;
const fact = (title: string, slug: string): HealthSource => source(title, `https://www.who.int/news-room/fact-sheets/detail/${slug}`);
const source = (title: string, url: string): HealthSource => ({title, organization: 'WHO', url, verifiedOn: '2026-11-06'});
export const HEALTH_SOURCES = {
  sleepDuration: {title:'About Sleep',organization:'CDC',url:'https://www.cdc.gov/sleep/about/index.html',verifiedOn:'2026-11-08',locator:'Recommended daily sleep by age; sleep quality; benefits'} as HealthSource,
  ...NUTRITION_SOURCES,
  nutritionDiet: NUTRITION_SOURCES.diet, nutritionSafety: NUTRITION_SOURCES.safety,
  malaria: fact('Malaria', 'malaria'), diabetes: fact('Diabetes', 'diabetes'),
  hypertension: fact('Hypertension', 'hypertension'), tb: fact('Tuberculosis', 'tuberculosis'),
  flu: fact('Influenza (seasonal)', 'influenza-(seasonal)'),
  cold: source('Human metapneumovirus (hMPV) infection: questions and answers', 'https://www.who.int/news-room/questions-and-answers/item/human-metapneumovirus-(hmpv)-infection'),
  diarrhoea: fact('Diarrhoeal disease', 'diarrhoeal-disease'), headache: fact('Migraine and other headache disorders', 'headache-disorders'),
  diet: fact('Healthy diet', 'healthy-diet'), maternal: fact('Maternal mortality', 'maternal-mortality'),
  feeding: fact('Infant and young child feeding', 'infant-and-young-child-feeding'),
  vaccines: fact('Immunization coverage', 'immunization-coverage'),
  anxiety: fact('Anxiety disorders', 'anxiety-disorders'), mental: fact('Mental disorders', 'mental-disorders'),
  adolescent: fact('Mental health of adolescents', 'adolescent-mental-health'),
  amr: fact('Antimicrobial resistance', 'antimicrobial-resistance'),
  falsified: fact('Substandard and falsified medical products', 'substandard-and-falsified-medical-products'),
  stress: source('Stress: questions and answers', 'https://www.who.int/news-room/questions-and-answers/item/stress'),
  hands: source('WHO/UNICEF community hand hygiene guidelines announcement', 'https://www.who.int/news/item/15-10-2025-new-guidelines-on-community-hand-hygiene-to-help-governments-reduce-the-spread-of-infectious-diseases'),
  postnatal: source('Positive postnatal experience for women and newborns', 'https://www.who.int/news/item/22-02-2024-new-series-highlights-importance-positive-postnatal-experience-all-women-newborns'),
  safety: source('5 Moments for medication safety', 'https://qualityhealthservices.who.int/quality-toolkit/qt-catalog-item/5-moments-for-medication-safety'),
  list: source('World Patient Safety Day 2022: key messages', 'https://www.who.int/campaigns/world-patient-safety-day/2022/key-messages'),
  antibiotics: source('What you need to know about antibiotic resistance', 'https://www.who.int/docs/librariesprovider2/default-document-library/what-you-need-to-know-about-antibiotic-resistance-eng-%281%29.pdf?sfvrsn=5d89a70_6'),
} as const;

export type FollowUpKind = 'definition' | 'signs' | 'duration' | 'frequency' | 'safety' | 'alternatives' | 'causes' | 'prevention' | 'children' | 'care' | 'benefits' | 'nutrients' | 'preparation' | 'limitations';
export type MatchingRule = Readonly<{
  label: string; priority: number; phrases: readonly string[]; keywords: readonly string[];
  supersedes?: readonly string[];
  entities?: readonly string[];
}>;
// Explicit editorial weights, not learned probabilities. Generic umbrella entries
// yield to their specific children; independent topics require clarification.
const MATCHING: Record<string, MatchingRule> = {
  'med-antibiotics': {label:'antibiotics',priority:4,phrases:['what are antibiotics'],keywords:['antibiotics']},
  'med-resistance': {label:'antibiotic resistance',priority:4,phrases:['antibiotic resistance','antimicrobial resistance'],keywords:['resistance']},
  'med-safety': {label:'medication safety',priority:4,phrases:['medication safety'],keywords:['safety']},
  'med-list': {label:'medicines lists',priority:4,phrases:['medicines list','medication list'],keywords:['list']},
  'med-quality': {label:'medicine quality',priority:4,phrases:['falsified medicines','substandard medicines'],keywords:['falsified','substandard']},
  'disease-malaria': {label:'malaria',priority:3,phrases:[],keywords:['malaria']},
  'disease-diabetes': {label:'diabetes',priority:3,phrases:[],keywords:['diabetes']},
  'disease-hypertension': {label:'high blood pressure',priority:3,phrases:['high blood pressure'],keywords:['hypertension']},
  'disease-tb': {label:'tuberculosis',priority:3,phrases:[],keywords:['tuberculosis','tb']},
  'disease-flu': {label:'influenza',priority:3,phrases:['seasonal flu'],keywords:['influenza','flu']},
  'disease-common-cold': {label:'common cold',priority:3,phrases:['common cold','head cold'],keywords:[]},
  'maternal-postnatal': {label:'postnatal care',priority:3,phrases:['after childbirth'],keywords:['postnatal','postpartum'],supersedes:['maternal-antenatal']},
  'child-breastfeeding': {label:'breastfeeding',priority:3,phrases:['breast milk'],keywords:['breastfeeding'],supersedes:['maternal-antenatal']},
  'child-complementary-feeding': {label:'complementary feeding',priority:3,phrases:['complementary feeding','complementary food','starting solids','baby food'],keywords:[],supersedes:['maternal-antenatal']},
  'child-vaccination': {label:'vaccination',priority:3,phrases:[],keywords:['vaccines','vaccination','immunisation','immunization'],supersedes:['maternal-antenatal']},
  'maternal-antenatal': {label:'pregnancy and infant health',priority:0,phrases:['antenatal care','prenatal care'],keywords:['pregnancy','antenatal','prenatal','baby','babies','infant']},
  'nutrition-salt': {label:'salt',priority:3,phrases:[],keywords:['salt','sodium'],supersedes:['nutrition-variety']},
  'nutrition-sugar': {label:'free sugars',priority:3,phrases:['sugary drinks'],keywords:['sugar','sugars'],supersedes:['nutrition-variety']},
  'nutrition-grains': {label:'whole grains and pulses',priority:3,phrases:['whole grains','whole grain'],keywords:['wholegrains','pulses','legumes','beans','lentils','ndengu'],entities:['beans','lentils','ndengu'],supersedes:['nutrition-variety','nutrition-protein','nutrition-fibre','nutrition-carbohydrates','nutrition-micronutrients','nutrition-iron']},
  'nutrition-produce': {label:'fruit and vegetables',priority:3,phrases:[],keywords:['fruit','fruits','vegetables'],supersedes:['nutrition-variety']},
  'nutrition-variety': {label:'balanced eating',priority:0,phrases:['healthy eating','balanced meals','healthy food choices','healthy food options','healthy foods','food groups'],keywords:['nutrition','diet']},
  'mental-depression': {label:'depression awareness',priority:3,phrases:['persistent sadness','loss of interest'],keywords:['depression','depressed'],supersedes:['mental-support']},
  'mental-eating-disorders': {label:'eating-disorder awareness',priority:3,phrases:['eating disorder','eating disorders'],keywords:['anorexia','bulimia'],supersedes:['mental-support']},
  'mental-adolescent': {label:'adolescent mental wellbeing',priority:3,phrases:['adolescent mental health','teen mental health'],keywords:[],supersedes:['mental-support']},
  'mental-anxiety': {label:'anxiety',priority:3,phrases:[],keywords:['anxiety','anxious'],supersedes:['mental-support']},
  'mental-support': {label:'mental health support',priority:0,phrases:['mental health','mental wellbeing','emotional support','support a friend'],keywords:[]},
  'mental-stress': {label:'stress',priority:3,phrases:[],keywords:['stress','stressed','overwhelmed'],supersedes:['mental-support']},
  'general-diarrhoea': {label:'diarrhoea',priority:3,phrases:['loose stools'],keywords:['diarrhoea','diarrhea']},
  'general-headache': {label:'headaches',priority:3,phrases:[],keywords:['headache','headaches','migraine']},
  'general-cough': {label:'cough',priority:3,phrases:[],keywords:['cough','coughing']},
  'general-fever': {label:'fever',priority:3,phrases:[],keywords:['fever']},
  'general-handwashing': {label:'handwashing',priority:3,phrases:['wash my hands','wash your hands','washing my hands'],keywords:['handwashing','hygiene']},
  'general-sleep': {label:'sleep',priority:3,phrases:[],keywords:['sleep','sleeping','bedtime','insomnia']},
};
// Fixed, source-supported topic/facet answers. Each inherits its entry's sources,
// version and pending review status. Missing facets must never be synthesized.
const FOLLOW_UPS: Partial<Record<string, Partial<Record<FollowUpKind, string>>>> = {
  'general-sleep': {
    definition:'Healthy sleep involves both enough sleep for your age and good sleep quality: sleep that is refreshing and uninterrupted. Hours alone do not describe sleep health.',
    duration:'Sleep needs vary with age. CDC adult guidance per day is: ages 18\u201360, 7 or more hours; ages 61\u201364, 7\u20139 hours; ages 65 and older, 7\u20138 hours. Without assuming your age, these are adult age-group guidelines, not a personal target. Children and teenagers have different recommendations. Seek professional advice for persistent sleep problems.',
    signs:'Possible signs of poor sleep quality include trouble falling asleep, repeatedly waking at night, or feeling sleepy or tired despite enough sleep. These do not diagnose sleep deprivation or a sleep disorder; persistent concerns need professional assessment.',
    benefits:'Enough good-quality sleep supports emotional wellbeing, attention and memory. This is general education, not a treatment for an individual health condition.',
  },
  'nutrition-variety': {benefits:'A varied diet combines different food groups and nutrients. No single food provides everything; this is general education, not an individual meal prescription.',nutrients:'Different food groups contribute different nutrients: carbohydrate, protein, fat, vitamins and minerals. Variety matters more than relying on one food.',preparation:'Use safe water and clean utensils, separate raw and cooked food, cook thoroughly where needed, and store food at safe temperatures.',limitations:'This is general education, not a personalized meal plan. A qualified health professional can advise on individual dietary needs.'},
  'nutrition-produce': {benefits:'Fruit and vegetables contribute fibre, vitamins and minerals. Variety is useful; no single fruit or vegetable is a treatment.',nutrients:'Different fruits and vegetables provide different vitamins, minerals and fibre. Exact amounts depend on the food and its preparation.',preparation:'Use safe water and clean utensils. Separate raw and cooked food, cook thoroughly where needed, and store food at safe temperatures.',limitations:'A fruit or vegetable alone is not a complete diet. Individual dietary needs and food allergies require qualified professional advice.'},
  'nutrition-grains': {nutrients:'Beans, lentils and ndengu (green grams) contribute protein, fibre and iron. Whole grains contribute carbohydrate and fibre.',benefits:'Pulses and whole grains can contribute to a varied diet. This is food education, not treatment for a digestive or other medical condition.',preparation:'Use safe water and clean utensils, cook pulses thoroughly, and store prepared food safely.',limitations:'The nutrient content of a dish depends on its ingredients and preparation. This assistant cannot calculate an individual portion or meal plan.'},
  'disease-common-cold': {
    causes: 'A cold is caused by a virus. Human metapneumovirus (hMPV) is one example of a cold virus, not the only possible cause. Similar symptoms can occur with other infections, so symptoms alone do not identify a particular virus.',
    care: 'Seek professional advice if respiratory symptoms worsen or concern you. Cold-like symptoms overlap with other illnesses; this assistant cannot judge whether it is safe to wait.',
  },
  'mental-eating-disorders': {
    care: 'Concerns about eating, weight or body shape that cause distress or affect everyday life deserve professional assessment. Support is available; this assistant cannot diagnose an eating disorder.',
  },
  'disease-malaria': {
    causes: 'Malaria is caused by parasites passed to people through bites of infected mosquitoes. Symptoms alone cannot confirm malaria; suspected infection needs prompt professional assessment and testing.',
    prevention: 'Avoiding mosquito bites helps prevent malaria. WHO recommends insecticide-treated nets and other appropriate mosquito-control measures. Ask a qualified local health professional about prevention for your circumstances; this assistant cannot choose preventive medicines.',
    children: 'Young children are at higher risk of severe malaria. A child with suspected malaria needs prompt professional assessment and testing. Do not rely on this assistant to assess severity.',
    care: 'Suspected malaria needs prompt professional assessment and testing. Do not wait for a routine CallADoc appointment if someone is seriously unwell; seek urgent in-person care.',
  },
  'general-diarrhoea': {
    prevention: 'Safe drinking water, sanitation and handwashing help prevent some diarrhoeal infections. They do not replace professional care for someone who is unwell.',
    children: 'Diarrhoea can cause dangerous loss of water and salts in young children. Dehydration concerns, blood in stool or persistent diarrhoea need professional care; this assistant cannot assess a child.',
    care: 'Seek professional care for persistent diarrhoea, blood in stool or dehydration concerns. Young children are especially vulnerable. This assistant cannot determine whether it is safe to wait.',
  },
  'general-headache': {care: 'Recurring or concerning headaches need assessment by a qualified clinician. This assistant cannot identify the cause or determine whether it is safe to wait.'},
  'general-cough': {care: 'Persistent, worsening or severe respiratory symptoms need professional assessment. This assistant cannot determine the cause or whether it is safe to wait.'},
  'mental-anxiety': {care: 'Persistent fear or worry that disrupts daily life deserves professional assessment. Effective care is available, but this assistant cannot diagnose an anxiety disorder.'},
};
export type HealthKnowledgeEntry = Readonly<{
  id: string; category: HealthCategory; intent: string; patterns: readonly RegExp[];
  exampleQuestion: string; response: string; sources: readonly HealthSource[];
  contentVersion: string; reviewStatus: 'pending_clinical_review';
  matching: MatchingRule; followUps: Partial<Record<FollowUpKind, string>>;
}>;
function entry(id: string, category: HealthCategory, intent: string, pattern: RegExp,
  exampleQuestion: string, response: string, reference: HealthSource): HealthKnowledgeEntry {
  return {id, category, intent, patterns: [pattern], exampleQuestion, response,
    sources: id === 'general-sleep' ? [reference,HEALTH_SOURCES.sleepDuration] : id === 'nutrition-grains' ? [reference,NUTRITION_SOURCES.composition,NUTRITION_SOURCES.foods,NUTRITION_SOURCES.safety] : id === 'nutrition-variety' || id === 'nutrition-produce' ? [reference,NUTRITION_SOURCES.safety] : [reference], contentVersion: HEALTH_KNOWLEDGE_VERSION, reviewStatus: 'pending_clinical_review',
    matching: MATCHING[id], followUps: {...FOLLOW_UPS[id],...(id === 'mental-eating-disorders' ? {signs:response} : {})}};
}
// Catalog order does not select a response; the matcher scores explicit evidence.
// Medication entries deliberately match complete, general educational questions only.
export const HEALTH_KNOWLEDGE_BASE: readonly HealthKnowledgeEntry[] = [
  entry('med-antibiotics', 'medication_guidance', 'medication_education', /^(what are antibiotics|what do antibiotics do)$/, 'What are antibiotics?',
    'Antibiotics act against bacteria, not viruses. Whether an antibiotic is needed requires professional assessment; this assistant cannot choose one for you.', HEALTH_SOURCES.antibiotics),
  entry('med-resistance', 'medication_guidance', 'medication_education', /^(what is (antibiotic|antimicrobial) resistance|explain antibiotic resistance)$/, 'What is antibiotic resistance?',
    'Resistance means germs no longer respond to medicines intended to act against them. Misuse and overuse contribute to resistance. Discuss medicine questions with a qualified clinician or pharmacist.', HEALTH_SOURCES.amr),
  entry('med-safety', 'medication_guidance', 'medication_education', /^(what is medication safety|how can i use medicines safely)$/, 'What is medication safety?',
    'Medication safety includes discussing questions with a health professional when starting, taking, adding, reviewing or stopping a medicine. Ask what it is for and about possible risks; this assistant cannot decide changes for you.', HEALTH_SOURCES.safety),
  entry('med-list', 'medication_guidance', 'medication_education', /^(why keep a (medicines|medication) list|what is a (medicines|medication) list)$/, 'Why keep a medicines list?',
    'An up-to-date medicines list helps health workers understand what you use, including traditional medicines. Share it with your treating professional, rather than entering personal medication details into this assistant.', HEALTH_SOURCES.list),
  entry('med-quality', 'medication_guidance', 'medication_education', /^(what are (falsified|substandard|counterfeit) medicines|what are substandard and falsified medicines)$/, 'What are falsified medicines?',
    'Substandard products fail quality standards; falsified products misrepresent their identity, composition or source. They may cause harm or fail to work. A health professional should assess suspected problems; this chat cannot verify a product.', HEALTH_SOURCES.falsified),

  entry('disease-malaria', 'disease_info', 'malaria', /\bmalaria\b/, 'What is malaria?',
    'Malaria is a mosquito-borne parasitic infection that can become serious. Fever, chills and headache are possible symptoms but do not identify malaria. Suspected malaria needs prompt professional assessment and testing, not a chat diagnosis.', HEALTH_SOURCES.malaria),
  entry('disease-diabetes', 'disease_info', 'diabetes', /\bdiabetes\b/, 'Explain diabetes',
    'Diabetes is a long-term condition involving raised blood glucose. It can damage the heart, kidneys, eyes and nerves. Professional testing and ongoing care matter; this assistant cannot interpret your glucose results or decide treatment.', HEALTH_SOURCES.diabetes),
  entry('disease-hypertension', 'disease_info', 'hypertension', /\b(hypertension|high blood pressure)\b/, 'What is hypertension?',
    'Hypertension means persistently high blood pressure. Many people feel no symptoms, so measurement and professional assessment are important. It can harm the heart, brain and kidneys. Feeling well does not confirm normal blood pressure.', HEALTH_SOURCES.hypertension),
  entry('disease-tb', 'disease_info', 'tuberculosis', /\b(tuberculosis|tb)\b/, 'What is tuberculosis?',
    'Tuberculosis is a bacterial infection that often affects the lungs and can spread through the air. A persistent cough needs professional assessment and appropriate testing. This assistant cannot distinguish TB from other illnesses.', HEALTH_SOURCES.tb),
  entry('disease-flu', 'disease_info', 'influenza', /\b(influenza|flu)\b/, 'What is seasonal flu?',
    'Seasonal influenza is a viral respiratory infection. Fever, cough, sore throat and body aches can occur, but overlap with other illnesses. Severe symptoms or concerns in someone at higher risk need medical assessment.', HEALTH_SOURCES.flu),
  entry('disease-common-cold', 'disease_info', 'common_cold', /\b(common|head) colds?\b|^(what is|what causes?|what is the cause of|explain) (a|the) cold$|^(a|the) cold$/, 'What is the common cold?',
    'The common cold is an upper respiratory infection caused by viruses. Cold-like symptoms can overlap with other respiratory infections. A healthcare professional can assess symptoms that are severe, worsening or concerning; this assistant cannot identify the cause.', HEALTH_SOURCES.cold),

  entry('maternal-postnatal', 'maternal_child_health', 'postnatal', /\b(postnatal|postpartum|after childbirth)\b/, 'Why is postnatal care important?',
    'Postnatal care supports both mother and newborn after birth, including physical recovery, feeding and emotional wellbeing. Arrange follow-up with a qualified maternity team; do not wait for a routine checkup if either becomes unwell.', HEALTH_SOURCES.postnatal),
  entry('child-breastfeeding', 'maternal_child_health', 'breastfeeding', /\b(breastfeed\w*|breast milk)\b/, 'Tell me about breastfeeding',
    'Breastfeeding supports infant nutrition and protection against infections. WHO recommends exclusive breastfeeding for the first six months. Feeding difficulties and individual circumstances need skilled support from a qualified health worker.', HEALTH_SOURCES.feeding),
  entry('child-complementary-feeding', 'maternal_child_health', 'child_feeding', /\b(complementary foods?|complementary feeding|starting solids|baby foods?)\b/, 'What is complementary feeding?',
    'Around six months, infants need safe, nutritious complementary foods alongside continued breastfeeding. Food variety and safe handling matter. A child-health professional can advise on feeding difficulties and individual needs.', HEALTH_SOURCES.feeding),
  entry('child-vaccination', 'maternal_child_health', 'vaccination', /\b(vaccin\w*|immuni[sz]\w*)\b/, 'Why do children need vaccines?',
    'Routine vaccination protects children against infections that can cause serious illness. Ask your local child-health clinic to check the child health record and the current Kenyan schedule, including any missed vaccinations.', HEALTH_SOURCES.vaccines),
  entry('maternal-antenatal', 'maternal_child_health', 'pregnancy', /\b(pregnan\w*|antenatal|prenatal|baby|babies|infant)\b/, 'Why attend antenatal checkups?',
    'Skilled care before, during and after birth helps protect mothers and newborns. Antenatal checkups support professional assessment and discussion of concerns. This assistant cannot assess pregnancy or infant symptoms; contact a qualified health professional.', HEALTH_SOURCES.maternal),

  entry('nutrition-salt', 'nutrition', 'salt', /\b(salt|sodium)\b/, 'Why limit salt?',
    'Too much sodium can raise blood pressure. Packaged foods, salty snacks and stock cubes can contribute. Comparing labels helps identify sodium; individual dietary needs require professional advice.', HEALTH_SOURCES.diet),
  entry('nutrition-sugar', 'nutrition', 'sugar', /\b(sugars?|sugary drinks?)\b/, 'What about sugary drinks?',
    'Frequent foods and drinks high in free sugars can harm health. Free sugars include those added to foods and those in honey, syrups and fruit juice. Limit these as part of a varied diet.', HEALTH_SOURCES.diet),
  entry('nutrition-grains', 'nutrition', 'whole_grains', /\b(whole grains?|wholegrains?|pulses|legumes|beans|lentils|ndengu)\b/, 'Why eat beans and whole grains?',
    'Whole grains, beans and lentils provide dietary fibre and nutrients. They can form part of a varied diet alongside other food groups. This is general food information, not a diet plan for a medical condition.', HEALTH_SOURCES.diet),
  entry('nutrition-produce', 'nutrition', 'fruit_vegetables', /\b(fruits?|vegetables?)\b/, 'Why eat vegetables?',
    'A variety of fruits and vegetables contributes vitamins, minerals and fibre. Different foods contribute different nutrients. Whole fruit and fruit juice differ: juice can contain substantial free sugars.', HEALTH_SOURCES.diet),
  entry('nutrition-variety', 'nutrition', 'nutrition', /\b(nutrition|diet|healthy (eating|foods?|food choices|food options)|balanced (meals?|diets?)|food groups)\b|^(what|which) foods? (are|is) (good|healthy)( for (me|us|you))?$|^what should (i|we) eat to (stay|be|keep) healthy$/, 'Tips for healthy eating',
    'A varied diet includes vegetables, fruit, whole grains, pulses and appropriate protein sources. Limit foods high in free sugars, salt and unhealthy fats. Personal needs differ; seek professional dietary advice for medical conditions.', HEALTH_SOURCES.diet),

  entry('mental-depression', 'mental_health', 'depression', /\b(depress\w*|persistent sadness|loss of interest)\b/, 'What is depression?',
    'Depression involves more than a brief low mood and can affect interest, energy and daily life. Support and effective care exist. A qualified professional can assess persistent concerns; this assistant cannot diagnose depression.', HEALTH_SOURCES.mental),
  entry('mental-eating-disorders', 'mental_health', 'eating_disorders', /\b(eating disorders?|anorexia|bulimia)\b/, 'What are signs of an eating disorder?',
    'Eating disorders can involve disturbed eating patterns and strong concerns about food, body weight or shape that cause distress or harm health. These signs do not establish a diagnosis. A qualified health professional can assess concerns and help someone access care.', HEALTH_SOURCES.mental),
  entry('mental-adolescent', 'mental_health', 'adolescent_mental_health', /\b(teen\w*|adolescen\w*)\b.*\b(mental|wellbeing|emotional)\b|\bmental health\b.*\b(teen\w*|adolescen\w*)\b/, 'How can teenagers support mental wellbeing?',
    'Supportive families, schools and communities help adolescent mental wellbeing. Healthy sleep, social connections and access to professional support matter. A trusted adult or qualified health worker can help with persistent distress.', HEALTH_SOURCES.adolescent),
  entry('mental-anxiety', 'mental_health', 'stress', /\b(anxious|anxiety)\b/, 'What is anxiety?',
    'Feeling anxious sometimes is common. Persistent, excessive fear or worry that disrupts daily life deserves professional assessment. Effective care is available; this assistant cannot identify an anxiety disorder.', HEALTH_SOURCES.anxiety),
  entry('mental-support', 'mental_health', 'mental_support', /\b(mental health|mental wellbeing|emotional support|support a friend)\b/, 'Where can I find emotional support?',
    'Talking with someone you trust can help you seek support. If distress affects daily life or is difficult to manage, contact a qualified health professional. This assistant does not provide counselling or assess safety.', HEALTH_SOURCES.stress),
  entry('mental-stress', 'mental_health', 'stress', /\b(stress\w*|overwhelmed)\b/, 'How to manage stress',
    'Stress is a response to difficult situations. A regular routine, rest and connection with trusted people can support wellbeing. Seek professional help when coping is difficult or distress persists.', HEALTH_SOURCES.stress),

  entry('general-diarrhoea', 'symptoms', 'symptoms', /\b(diarrh\w*|loose stools?)\b/, 'What is diarrhoea?',
    'Diarrhoea can cause loss of water and salts, especially dangerous for young children. Blood in stool, dehydration concerns or persistent diarrhoea need professional care. Safe water, sanitation and hand hygiene help prevent some infections.', HEALTH_SOURCES.diarrhoea),
  entry('general-headache', 'symptoms', 'symptoms', /\b(headaches?|migraine)\b/, 'Tell me about headaches',
    'Headache disorders can recur and affect daily life. Head pain alone does not identify its cause. A qualified clinician can assess recurring or concerning headaches; this assistant cannot identify a headache disorder.', HEALTH_SOURCES.headache),
  entry('general-cough', 'symptoms', 'symptoms', /\bcough\w*\b/, 'General information about cough',
    'Cough can accompany respiratory infections, including influenza, but does not identify the cause. Persistent, worsening or severe symptoms need professional assessment. This assistant cannot distinguish respiratory illnesses.', HEALTH_SOURCES.flu),
  entry('general-fever', 'symptoms', 'symptoms', /\bfever\b/, 'General information about fever',
    'Fever can occur with malaria and other illnesses; fever alone does not establish a diagnosis. Suspected malaria requires prompt professional assessment and testing. Seek professional care for concerning symptoms rather than relying on this chat.', HEALTH_SOURCES.malaria),
  entry('general-handwashing', 'symptoms', 'hygiene', /\b(hygiene|handwashing|wash(ing)? (my |your )?hands)\b/, 'Why wash my hands?',
    'Handwashing with soap and water helps limit the spread of infections. Important times include before preparing or eating food and after using the toilet. Hand hygiene supports prevention; it does not replace medical assessment.', HEALTH_SOURCES.hands),
  entry('general-sleep', 'symptoms', 'sleep', /\b(sleep|sleeping|bedtime|insomnia)\b/, 'Tips for better sleep',
    'Regular sleeping and waking times and a quiet sleeping environment can support wellbeing. Sleep matters for both body and mind. Persistent sleep difficulties or difficulties affecting daily life deserve professional advice.', HEALTH_SOURCES.stress),
  ...nutritionKnowledge(HEALTH_KNOWLEDGE_VERSION),
];
