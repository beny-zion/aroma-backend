/**
 * Seed Script - מסד נתונים מלא לארומה פלוס
 *
 * יוצר 20 לקוחות משלמים עם סניפים, מכשירים והיסטוריית מילויים
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Customer, Branch, Device, Scent, ServiceLog } = require('../src/models');

// ========== נתונים קבועים ==========

const SCENTS_DATA = [
  { name: 'פרפל', stockQuantity: 8500, description: 'ריח פירותי מתוק' },
  { name: 'חיים יפים', stockQuantity: 12000, description: 'ריח רענן וקליל' },
  { name: 'קלואה', stockQuantity: 6500, description: 'ריח פרחוני עדין' },
  { name: 'אינויקטיס', stockQuantity: 9200, description: 'ריח גברי אלגנטי' },
  { name: 'גבריאל', stockQuantity: 7800, description: 'ריח עץ ומוסק' },
  { name: 'בלו שנאל', stockQuantity: 5500, description: 'ריח ים ורעננות' },
  { name: 'ונילה פינק', stockQuantity: 4200, description: 'ונילה מתוקה' },
  { name: 'גרין תה', stockQuantity: 3800, description: 'תה ירוק מרענן' },
  { name: 'לבנדר דרימס', stockQuantity: 4500, description: 'לבנדר מרגיע' },
  { name: 'אושן בריז', stockQuantity: 5100, description: 'ריח ים וקוקוס' },
  { name: 'רוז גולד', stockQuantity: 3200, description: 'ורדים יוקרתיים' },
  { name: 'סיטרוס פרש', stockQuantity: 6800, description: 'הדרים רעננים' }
];

const CUSTOMERS_DATA = [
  // רשתות גדולות
  {
    name: 'רייצל H',
    monthlyPrice: 4500,
    status: 'active',
    billingDetails: { taxId: '515678234', email: 'billing@reitzelh.co.il', phone: '03-5551234' },
    branches: [
      { branchName: 'רייצל H - ירושלים רוממה', city: 'ירושלים', region: 'אזור רוממה', address: 'רח\' יפו 182', devices: [
        { deviceType: 'אפליקציה', scent: 'חיים יפים', location: 'קומת כניסה' },
        { deviceType: 'אפליקציה', scent: 'חיים יפים', location: 'קומה 1' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'מחסן' }
      ]},
      { branchName: 'רייצל H - בני ברק', city: 'בני ברק', region: 'מרכז העיר', address: 'רח\' רבי עקיבא 45', devices: [
        { deviceType: 'אפליקציה', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'אפליקציה', scent: 'חיים יפים', location: 'גלריה' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'מחסן' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 2' }
      ]},
      { branchName: 'רייצל H - בית שמש', city: 'בית שמש', region: 'רמת בית שמש', address: 'נחל לכיש 12', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה ראשית' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 1' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 2' }
      ]}
    ]
  },
  {
    name: 'שמיז אופנה',
    monthlyPrice: 3200,
    status: 'active',
    billingDetails: { taxId: '516234789', email: 'office@shamiz.co.il', phone: '03-5552345' },
    branches: [
      { branchName: 'שמיז - ירושלים גאולה', city: 'ירושלים', region: 'אזור גאולה', address: 'רח\' מאה שערים 55', devices: [
        { deviceType: 'גדול', scent: 'קלואה', location: 'כניסה' },
        { deviceType: 'אפליקציה', scent: 'קלואה', location: 'קומת נשים' }
      ]},
      { branchName: 'שמיז - בני ברק', city: 'בני ברק', region: 'רח\' רבי עקיבא', address: 'רבי עקיבא 78', devices: [
        { deviceType: 'גדול', scent: 'פרפל', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'קומה 1' }
      ]},
      { branchName: 'שמיז - אשדוד', city: 'אשדוד', region: 'רובע ז', address: 'שד\' הנשיא 34', devices: [
        { deviceType: 'אפליקציה', scent: 'קלואה', location: 'כניסה' }
      ]},
      { branchName: 'שמיז - ביתר עילית', city: 'ביתר עילית', region: 'מרכז', address: 'רח\' הרב שך 8', devices: [
        { deviceType: 'גדול', scent: 'קלואה', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'קלואה', location: 'קומה עליונה' }
      ]}
    ]
  },
  {
    name: 'מילה בגדים',
    monthlyPrice: 2800,
    status: 'active',
    billingDetails: { taxId: '517345890', email: 'mila@mila-fashion.co.il', phone: '03-5553456' },
    branches: [
      { branchName: 'מילה - ירושלים רמות', city: 'ירושלים', region: 'אזור רמות', address: 'גולדה מאיר 15', devices: [
        { deviceType: 'גדול', scent: 'קלואה', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'קלואה', location: 'קומה 1' }
      ]},
      { branchName: 'מילה - בני ברק', city: 'בני ברק', region: 'מרכז', address: 'ז\'בוטינסקי 22', devices: [
        { deviceType: 'גדול', scent: 'קלואה', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'קלואה', location: 'חדר הלבשה' }
      ]},
      { branchName: 'מילה - בית שמש', city: 'בית שמש', region: 'רמת בית שמש א', address: 'נחל דולב 5', devices: [
        { deviceType: 'גדול', scent: 'קלואה', location: 'כניסה' }
      ]}
    ]
  },
  {
    name: 'גלורי שופס',
    monthlyPrice: 2400,
    status: 'active',
    billingDetails: { taxId: '518456901', email: 'info@glory-shops.co.il', phone: '03-5554567' },
    branches: [
      { branchName: 'גלורי - ירושלים רוממה', city: 'ירושלים', region: 'אזור רוממה', address: 'סורוצקין 5', devices: [
        { deviceType: 'גדול', scent: 'פרפל', location: 'כניסה' }
      ]},
      { branchName: 'גלורי - בני ברק', city: 'בני ברק', region: 'פארק אתרים', address: 'אתרים 8', devices: [
        { deviceType: 'גדול', scent: 'פרפל', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'קומה 1' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'קומה 2' }
      ]},
      { branchName: 'גלורי - אשדוד רובע ז', city: 'אשדוד', region: 'רובע ז', address: 'שד\' יצחק הנשיא 12', devices: [
        { deviceType: 'גדול', scent: 'פרפל', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'קומה 1' }
      ]}
    ]
  },
  {
    name: 'חן פאשן',
    monthlyPrice: 3600,
    status: 'active',
    billingDetails: { taxId: '519567012', email: 'chen@chen-fashion.co.il', phone: '03-5555678' },
    branches: [
      { branchName: 'חן פאשן - ירושלים יפו', city: 'ירושלים', region: 'אזור יפו', address: 'יפו 120', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' }
      ]},
      { branchName: 'חן פאשן - ירושלים רמות', city: 'ירושלים', region: 'אזור רמות', address: 'רמות פולין 45', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' }
      ]},
      { branchName: 'חן פאשן - בני ברק', city: 'בני ברק', region: 'רח\' רבי עקיבא', address: 'רבי עקיבא 112', devices: [
        { deviceType: 'אפליקציה', scent: 'חיים יפים', location: 'כניסה' }
      ]},
      { branchName: 'חן פאשן - בית שמש', city: 'בית שמש', region: 'מרכז', address: 'נהר הירדן 8', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 1' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 2' }
      ]},
      { branchName: 'חן פאשן - ביתר עילית', city: 'ביתר עילית', region: 'מרכז', address: 'אבני נזר 15', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' }
      ]},
      { branchName: 'חן פאשן - אלעד', city: 'אלעד', region: 'מרכז', address: 'רח\' הרב שך 22', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה עליונה' }
      ]},
      { branchName: 'חן פאשן - אשדוד', city: 'אשדוד', region: 'רובע ז', address: 'העצמאות 67', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 1' }
      ]}
    ]
  },
  // מוסדות חינוך
  {
    name: 'חיידר רמות',
    monthlyPrice: 1800,
    status: 'active',
    billingDetails: { taxId: '580123456', email: 'hanhala@cheider-ramot.org', phone: '02-5861234' },
    branches: [
      { branchName: 'חיידר רמות - בנין ראשי', city: 'ירושלים', region: 'אזור רמות', address: 'רמות פולין 78', devices: [
        { deviceType: 'גדול', scent: 'פרפל', location: 'כניסה ראשית' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'שירותים קומה 1' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'שירותים קומה 2' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'חדר מורים' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'אולם תפילה' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'קומה 3' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'מרתף' }
      ]}
    ]
  },
  {
    name: 'חיידר תולדות אהרון',
    monthlyPrice: 1400,
    status: 'active',
    billingDetails: { taxId: '580234567', email: 'office@toldos-aharon.org', phone: '02-5862345' },
    branches: [
      { branchName: 'חיידר תולדות א"י - גאולה', city: 'ירושלים', region: 'אזור גאולה', address: 'שבטי ישראל 12', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 1' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 2' }
      ]}
    ]
  },
  {
    name: 'מוסדות ערלוי',
    monthlyPrice: 2200,
    status: 'active',
    billingDetails: { taxId: '580345678', email: 'erloi@erloi.org', phone: '02-5863456' },
    branches: [
      { branchName: 'ערלוי - ירושלים קטמון', city: 'ירושלים', region: 'שכונת קטמון', address: 'רח\' הפלמ"ח 34', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'אולם' },
        { deviceType: 'אפליקציה', scent: 'חיים יפים', location: 'משרדים' },
        { deviceType: 'אפליקציה', scent: 'פרפל', location: 'קומה 2' }
      ]},
      { branchName: 'חיידר ערלוי - ביתר', city: 'ביתר עילית', region: 'רמה א', address: 'אבני נזר 45', devices: [
        { deviceType: 'אפליקציה', scent: 'פרפל', location: 'כניסה' },
        { deviceType: 'אפליקציה', scent: 'פרפל', location: 'קומה 1' },
        { deviceType: 'אפליקציה', scent: 'חיים יפים', location: 'קומה 2' }
      ]}
    ]
  },
  {
    name: 'סמינר בית יעקב מודיעין',
    monthlyPrice: 1100,
    status: 'active',
    billingDetails: { taxId: '580456789', email: 'seminary@by-modiin.org', phone: '08-9761234' },
    branches: [
      { branchName: 'סמינר - מודיעין עילית', city: 'מודיעין עילית', region: 'קרית ספר', address: 'רח\' הרב שך 67', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'דנקיו', scent: 'חיים יפים', location: 'אולם' },
        { deviceType: 'דנקיו', scent: 'חיים יפים', location: 'קומה 2' }
      ]}
    ]
  },
  {
    name: 'חיידר כלל חסידי',
    monthlyPrice: 1600,
    status: 'active',
    billingDetails: { taxId: '580567890', email: 'klal@klal-chasidi.org', phone: '03-5781234' },
    branches: [
      { branchName: 'חיידר כלל חסידי - בני ברק', city: 'בני ברק', region: 'שכונת זכרון מאיר', address: 'רשב"ם 23', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 1' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'קומה 2' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'שירותים' }
      ]}
    ]
  },
  // אולמות אירועים
  {
    name: 'אולמי נטורי קרתא',
    monthlyPrice: 1500,
    status: 'active',
    billingDetails: { taxId: '512345678', email: 'events@nk-halls.co.il', phone: '02-5371234' },
    branches: [
      { branchName: 'אולם נטורי קרתא - גאולה', city: 'ירושלים', region: 'אזור גאולה', address: 'מאה שערים 100', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'לובי' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'אולם גברים' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'אולם נשים' }
      ]}
    ]
  },
  {
    name: 'אולמי בנות ירושלים',
    monthlyPrice: 1200,
    status: 'active',
    billingDetails: { taxId: '512456789', email: 'info@bnot-jlm.co.il', phone: '02-5372345' },
    branches: [
      { branchName: 'אולמי בנות ירושלים', city: 'ירושלים', region: 'אזור גאולה', address: 'יחזקאל 55', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'רוז גולד', location: 'אולם' }
      ]}
    ]
  },
  {
    name: 'אולם הכתר',
    monthlyPrice: 950,
    status: 'active',
    billingDetails: { taxId: '512567890', email: 'haketer@haketer-hall.co.il', phone: '03-5782345' },
    branches: [
      { branchName: 'אולם הכתר - בני ברק', city: 'בני ברק', region: 'רמת אהרון', address: 'הרב דסלר 12', devices: [
        { deviceType: 'גדול', scent: 'אינויקטיס', location: 'לובי' },
        { deviceType: 'גדול', scent: 'גבריאל', location: 'אולם' }
      ]}
    ]
  },
  {
    name: 'אולמי אובליון',
    monthlyPrice: 1100,
    status: 'active',
    billingDetails: { taxId: '512678901', email: 'events@oblivion.co.il', phone: '08-9762345' },
    branches: [
      { branchName: 'ביחד אולם שמחות - מודיעין', city: 'מודיעין עילית', region: 'קרית ספר', address: 'דרך האבות 8', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה נשים' },
        { deviceType: 'גדול', scent: 'גבריאל', location: 'כניסה גברים' }
      ]}
    ]
  },
  // בתי כנסת ומקוואות
  {
    name: 'בית כנסת תולדות אברהם יצחק',
    monthlyPrice: 800,
    status: 'active',
    billingDetails: { taxId: '580678901', email: 'gabai@tayi.org', phone: '02-5381234' },
    branches: [
      { branchName: 'בית כנסת תולדות א"י - גאולה', city: 'ירושלים', region: 'אזור גאולה', address: 'מאה שערים 45', devices: [
        { deviceType: 'גדול', scent: 'אינויקטיס', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'אינויקטיס', location: 'אולם תפילה' }
      ]}
    ]
  },
  {
    name: 'מקווה בית וגן',
    monthlyPrice: 700,
    status: 'active',
    billingDetails: { taxId: '580789012', email: 'mikveh@beitvegan.org', phone: '02-5431234' },
    branches: [
      { branchName: 'מקווה בית וגן', city: 'ירושלים', region: 'בית וגן', address: 'עוזיאל 18', devices: [
        { deviceType: 'גדול', scent: 'פרפל', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'פרפל', location: 'קומה תחתונה' }
      ]}
    ]
  },
  // עסקים בודדים
  {
    name: 'בזאר שטראוס',
    monthlyPrice: 2600,
    status: 'active',
    billingDetails: { taxId: '513789012', email: 'info@bazarshtraus.co.il', phone: '02-5391234' },
    branches: [
      { branchName: 'בזאר שטראוס - ירושלים הר נוף', city: 'ירושלים', region: 'הר נוף', address: 'שדרות הרב עובדיה 15', devices: [
        { deviceType: 'דנקיו', scent: 'חיים יפים', location: 'כניסה' }
      ]},
      { branchName: 'בזאר שטראוס - ביתר', city: 'ביתר עילית', region: 'מרכז מסחרי', address: 'כיכר הקניות', devices: [
        { deviceType: 'דנקיו', scent: 'חיים יפים', location: 'קומה עליונה' },
        { deviceType: 'דנקיו', scent: 'חיים יפים', location: 'קומה תחתונה' }
      ]},
      { branchName: 'בזאר שטראוס - בית שמש', city: 'בית שמש', region: 'רמת בית שמש', address: 'נחל לכיש 45', devices: [
        { deviceType: 'גדול', scent: 'אינויקטיס', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'אינויקטיס', location: 'קומה 1' }
      ]},
      { branchName: 'בזאר שטראוס - אשדוד', city: 'אשדוד', region: 'רובע ז', address: 'העצמאות 89', devices: [
        { deviceType: 'אפליקציה', scent: 'אינויקטיס', location: 'כניסה' },
        { deviceType: 'אפליקציה', scent: 'אינויקטיס', location: 'קומה 1' }
      ]},
      { branchName: 'בזאר שטראוס - מודיעין', city: 'מודיעין עילית', region: 'קרית ספר', address: 'יהודה הנשיא 12', devices: [
        { deviceType: 'גדול', scent: 'אינויקטיס', location: 'כניסה' }
      ]}
    ]
  },
  {
    name: 'שיח סוד ספא',
    monthlyPrice: 1900,
    status: 'active',
    billingDetails: { taxId: '514890123', email: 'spa@shichsod.co.il', phone: '02-9991234' },
    branches: [
      { branchName: 'שיח סוד - בית שמש', city: 'בית שמש', region: 'רמת בית שמש', address: 'נחל שורק 8', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'אזור ספא' },
        { deviceType: 'גדול', scent: 'לבנדר דרימס', location: 'חדרי טיפולים' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'לובי' },
        { deviceType: 'קטן', scent: 'חיים יפים', location: 'שירותים' },
        { deviceType: 'קטן', scent: 'חיים יפים', location: 'מלתחות' }
      ]},
      { branchName: 'וילת שיח סוד - רמות', city: 'ירושלים', region: 'אזור רמות', address: 'גולדה מאיר 88', devices: [
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'לבנדר דרימס', location: 'חדר VIP' }
      ]}
    ]
  },
  {
    name: 'ברודווי נעליים',
    monthlyPrice: 950,
    status: 'active',
    billingDetails: { taxId: '515901234', email: 'broadway@broadway-shoes.co.il', phone: '03-5793456' },
    branches: [
      { branchName: 'ברודווי - בני ברק', city: 'בני ברק', region: 'מרכז העיר', address: 'רבי עקיבא 67', devices: [
        { deviceType: 'קטן', scent: 'חיים יפים', location: 'פנים החנות' },
        { deviceType: 'גדול', scent: 'חיים יפים', location: 'כניסה' },
        { deviceType: 'גדול', scent: 'גבריאל', location: 'מחלקת גברים' }
      ]}
    ]
  },
  {
    name: 'קפה ליאון',
    monthlyPrice: 450,
    status: 'active',
    billingDetails: { taxId: '516012345', email: 'info@cafe-leon.co.il', phone: '08-8561234' },
    branches: [
      { branchName: 'קפה ליאון - אשדוד', city: 'אשדוד', region: 'אזור הסיטי', address: 'שד\' הציונות 12', devices: [
        { deviceType: 'גדול', scent: 'גבריאל', location: 'אזור ישיבה' }
      ]}
    ]
  }
];

// ========== פונקציות עזר ==========

function randomDate(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ========== Main Seed Function ==========

async function seedDatabase() {
  console.log('🚀 מתחיל יצירת מסד נתונים מלא...\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ מחובר ל-MongoDB Atlas\n');
  } catch (err) {
    console.error('❌ שגיאה בהתחברות:', err.message);
    process.exit(1);
  }

  // ניקוי מסד הנתונים
  console.log('🗑️ מנקה נתונים קיימים...');
  await Customer.deleteMany({});
  await Branch.deleteMany({});
  await Device.deleteMany({});
  await Scent.deleteMany({});
  await ServiceLog.deleteMany({});
  console.log('  ✅ כל הנתונים נמחקו\n');

  // יצירת ריחות
  console.log('🌸 יוצר ריחות...');
  const scentMap = new Map();
  for (const scentData of SCENTS_DATA) {
    const scent = await Scent.create(scentData);
    scentMap.set(scentData.name, scent._id);
  }
  console.log(`  ✅ נוצרו ${SCENTS_DATA.length} ריחות\n`);

  // יצירת לקוחות, סניפים ומכשירים
  console.log('👥 יוצר לקוחות וסניפים...');
  let totalBranches = 0;
  let totalDevices = 0;
  let totalServiceLogs = 0;

  for (const customerData of CUSTOMERS_DATA) {
    // יצירת לקוח
    const customer = await Customer.create({
      name: customerData.name,
      monthlyPrice: customerData.monthlyPrice,
      status: customerData.status,
      billingDetails: customerData.billingDetails
    });

    // יצירת סניפים ומכשירים
    for (const branchData of customerData.branches) {
      const branch = await Branch.create({
        customerId: customer._id,
        branchName: branchData.branchName,
        city: branchData.city,
        region: branchData.region,
        address: branchData.address,
        visitIntervalDays: 30,
        isActive: true
      });
      totalBranches++;

      // יצירת מכשירים לסניף
      for (const deviceData of branchData.devices) {
        const scentId = scentMap.get(deviceData.scent);
        const lastRefillDate = randomDate(60); // תאריך מילוי אחרון אקראי ב-60 יום האחרונים

        const device = await Device.create({
          branchId: branch._id,
          deviceType: deviceData.deviceType,
          scentId: scentId,
          locationInBranch: deviceData.location,
          lastRefillDate: lastRefillDate,
          refillIntervalDays: 30,
          mlPerRefill: deviceData.deviceType === 'קטן' ? 50 :
                       deviceData.deviceType === 'אפליקציה' ? 80 :
                       deviceData.deviceType === 'דנקיו' ? 150 : 100,
          isActive: true
        });
        totalDevices++;

        // יצירת 2-4 רשומות היסטוריה לכל מכשיר
        const numLogs = getRandomInt(2, 4);
        let logDate = new Date(lastRefillDate);

        for (let i = 0; i < numLogs; i++) {
          const mlFilled = device.mlPerRefill + getRandomInt(-20, 30);

          await ServiceLog.create({
            deviceId: device._id,
            date: new Date(logDate),
            mlFilled: mlFilled,
            scentId: scentId,
            serviceType: 'refill',
            technicianName: ['יוסי', 'משה', 'דוד', 'אברהם'][getRandomInt(0, 3)],
            technicianNotes: i === 0 ? '' : ['תקין', 'מכשיר תקין', 'בוצע מילוי', ''][getRandomInt(0, 3)]
          });
          totalServiceLogs++;

          // תאריך מילוי קודם (30 יום אחורה)
          logDate = new Date(logDate);
          logDate.setDate(logDate.getDate() - getRandomInt(25, 35));
        }
      }
    }

    console.log(`  ✅ ${customerData.name} - ${customerData.branches.length} סניפים`);
  }

  // סיכום
  console.log('\n========================================');
  console.log('✅ מסד הנתונים נוצר בהצלחה!');
  console.log('========================================');
  console.log(`📊 סיכום:`);
  console.log(`   לקוחות משלמים: ${CUSTOMERS_DATA.length}`);
  console.log(`   סניפים: ${totalBranches}`);
  console.log(`   מכשירים: ${totalDevices}`);
  console.log(`   ריחות: ${SCENTS_DATA.length}`);
  console.log(`   רשומות שירות: ${totalServiceLogs}`);
  console.log('========================================\n');

  // סטטיסטיקות נוספות
  const stats = await Device.aggregate([
    {
      $lookup: {
        from: 'branches',
        localField: 'branchId',
        foreignField: '_id',
        as: 'branch'
      }
    },
    { $unwind: '$branch' },
    {
      $group: {
        _id: '$branch.city',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  console.log('📍 מכשירים לפי עיר:');
  stats.forEach(s => console.log(`   ${s._id}: ${s.count} מכשירים`));

  await mongoose.disconnect();
  console.log('\n✅ סיום!');
}

seedDatabase().catch(err => {
  console.error('❌ שגיאה:', err);
  process.exit(1);
});
