// ข้อมูลตั้งต้นของบริษัท (ซอฟต์เวิร์ก ดิเวลลอปเมนท์ · กระบี่) — บุคคลและบริษัทคู่ค้าเป็นข้อมูลสมมติที่หน้าตาเหมือนจริง
// เลขประจำตัวผู้เสียภาษี/ประชาชนสร้างให้หลักตรวจสอบถูก (ไม่ใช่เลขของใครจริง) · ข้อมูลบริษัทเองเป็นของจริงจากระบบเดิม

/** เลข 13 หลักที่หลักสุดท้ายตรวจสอบถูก (สูตรเดียวกับกรมสรรพากร/บัตรประชาชน) */
function thaiId(first12) {
    let sum = 0;
    for (let index = 0; index < 12; index++) sum += Number(first12[index]) * (13 - index);
    return `${first12}${(11 - (sum % 11)) % 10}`;
}

const COMPANY = {
    cs_name_th: "ซอฟต์เวิร์ก ดิเวลลอปเมนท์",
    cs_name_en: "Softwork Development",
    cs_tax_id: "1819900399235",
    cs_address_th: "113/3 หมู่ 3 ตำบลคลองพน อำเภอคลองท่อม จังหวัดกระบี่ 81170",
    cs_address_en: "113/3 Moo 3, Khlong Phon, Khlong Thom, Krabi 81170",
    cs_phone: "0980300822",
    cs_email: "softwork.develop@gmail.com",
    cs_website: "https://softwork.fasttiw.com/",
    cs_vat_registered_from: null,
    cs_quotation_valid_days: 30,
    cs_quotation_terms_th:
        "1. ชำระเงินตามงวดที่ระบุ ภายในเครดิตเทอมนับจากวันที่ในใบแจ้งหนี้\n2. ราคารวมการรับประกันแก้ไขข้อผิดพลาดของระบบ 90 วันหลังส่งมอบ\n3. ใบเสนอราคานี้มีผลถึงวันที่ระบุ",
    cs_quotation_terms_en:
        "1. Payment by the stated milestones within the credit term from the invoice date.\n2. Includes a 90-day bug-fix warranty after delivery.\n3. This quotation is valid until the date stated.",
    cs_allow_self_approval: false,
    cs_default_credit_days: 30,
    cs_promptpay_id: null,
    cs_invoice_notes_th: "โอนเงินเข้าบัญชีกรุงไทย 790-0-47543-5 ชื่อบัญชี หัสนัย หม้อยา แล้วแจ้งหลักฐานทางอีเมล",
    cs_invoice_notes_en: "Please transfer to Krungthai Bank 790-0-47543-5 (Hatsanai Moya) and email the transfer slip.",
};
const COMPANY_LOGO = "/uploads/company/logo-1791889016718.png";

const HEAD_OFFICE = {
    branch_name_th: "สำนักงานใหญ่",
    branch_name_en: "Head Office",
    branch_address_th: COMPANY.cs_address_th,
    branch_address_en: COMPANY.cs_address_en,
    branch_phone: COMPANY.cs_phone,
    branch_status: "active",
};

const BANK_ACCOUNT = {
    ba_bank_name: "กรุงไทย",
    ba_account_name: "หัสนัย หม้อยา",
    ba_account_no: "7900475435",
    ba_bank_branch: "สาขาโลตัสกระบี่",
    ba_swift_code: "KRTHTHBK",
    ba_currency: "THB",
    ba_is_default: true,
    ba_status: "active",
};

// แผนก (สำนักงานใหญ่) — key ใช้อ้างในสคริปต์
const DEPARTMENTS = {
    MGT: "ฝ่ายบริหาร",
    ACC: "บัญชีและการเงิน",
    HRM: "ทรัพยากรบุคคล",
    SAL: "ฝ่ายขายและลูกค้าสัมพันธ์",
    DEV: "พัฒนาซอฟต์แวร์",
    UXD: "ออกแบบ UX/UI",
    QAT: "ทดสอบและประกันคุณภาพ",
    ADM: "ธุรการ",
};

// สิทธิ์ (role) — ทุก role ดูหน้าแรกได้ · ทุกคนเบิกเงิน ขอลา ลงเวลาได้อยู่แล้วโดยไม่ต้องมีสิทธิ์
const ROLES = {
    md: { name: "กรรมการผู้จัดการ", keys: "ALL" },
    salesManager: {
        name: "ผู้จัดการฝ่ายขาย",
        keys: [
            "dashboard", "viewAllProjects", "viewOwnProjects", "createProject", "clientManagement", "createClient", "editClient",
            "productManagement", "viewQuotations", "createQuotation", "approveQuotation", "cancelQuotation", "viewInvoices",
            "createInvoice", "approveInvoice", "viewReceipts", "salesReports", "viewMemberKpi",
        ],
    },
    sales: {
        name: "พนักงานขาย",
        keys: [
            "dashboard", "viewOwnProjects", "createProject", "clientManagement", "createClient", "editClient", "viewQuotations",
            "createQuotation", "viewInvoices", "createInvoice",
        ],
    },
    accountant: {
        name: "นักบัญชี",
        keys: [
            "dashboard", "clientManagement", "viewQuotations", "viewInvoices", "createInvoice", "cancelInvoice", "viewReceipts",
            "createReceipt", "cancelReceipt", "salesReports", "manageVendors", "viewExpenses", "createExpense", "approveExpense",
            "makePayment", "cancelPayment", "viewPayroll", "refundCustomer",
        ],
    },
    hr: {
        name: "เจ้าหน้าที่ทรัพยากรบุคคล",
        keys: [
            "dashboard", "departmentManagement", "createDepartment", "editDepartment", "manageEmployees", "viewPayroll",
            "runPayroll", "approveLeave", "manageHrSettings", "viewMemberKpi",
        ],
    },
    techLead: {
        name: "หัวหน้าทีมพัฒนา",
        keys: ["dashboard", "viewAllProjects", "viewOwnProjects", "createProject", "viewMemberKpi", "approveTimesheet", "approveLeave"],
    },
    staff: { name: "พนักงานทั่วไป", keys: ["dashboard", "viewOwnProjects"] },
};

// เจ้าของกิจการ (ไม่อยู่ในบัญชีเงินเดือน)
const OWNER = {
    username: "hatsanai",
    fname: "หัสนัย",
    lname: "หม้อยา",
    email: "hatsanay022com@gmail.com",
    phone: "0980300822",
    role: "md",
};

// พนักงาน — username ว่าง = ไม่มีบัญชีเข้าระบบ · hireAt = วันที่สคริปต์เพิ่มเข้าระบบ (ว่าง = ตอนตั้งค่าเริ่มต้น)
const EMPLOYEES = [
    {
        key: "siriporn", username: "siriporn", role: "salesManager", title: "นางสาว", first: "ศิริพร", last: "แก้วมณี",
        firstEn: "Siriporn", lastEn: "Kaewmanee", nickname: "พลอย", dept: "SAL", position: "ผู้จัดการฝ่ายขาย",
        hire: "2026-01-05", salary: "38000", birth: "1990-03-14", bank: "กสิกรไทย", account: "0418823571",
        phone: "0812345671", address: "45/2 ถนนมหาราช ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
    },
    {
        key: "thanawat", username: "thanawat", role: "sales", title: "นาย", first: "ธนวัฒน์", last: "ศรีสุวรรณ",
        firstEn: "Thanawat", lastEn: "Srisuwan", nickname: "ต้น", dept: "SAL", position: "พนักงานขาย",
        hire: "2026-03-02", salary: "22000", birth: "1998-07-22", bank: "กรุงไทย", account: "6781203345",
        phone: "0823456712", address: "12 หมู่ 5 ตำบลคลองท่อมใต้ อำเภอคลองท่อม จังหวัดกระบี่ 81120",
        recurring: [{ kind: "earning", label: "ค่าน้ำมันรถ", amount: "2000", taxable: true, ssoWage: false, from: "2026-05-01" }],
    },
    {
        key: "kamonchanok", username: "kamonchanok", role: "accountant", title: "นางสาว", first: "กมลชนก", last: "บุญมา",
        firstEn: "Kamonchanok", lastEn: "Boonma", nickname: "แพร", dept: "ACC", position: "นักบัญชี",
        hire: "2026-01-05", salary: "28000", birth: "1993-11-02", bank: "ไทยพาณิชย์", account: "4120987654",
        phone: "0834567123", address: "88/14 ถนนอุตรกิจ ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
    },
    {
        key: "wannipa", username: "wannipa", role: "hr", title: "นาง", first: "วรรณิภา", last: "จันทร์เพ็ญ",
        firstEn: "Wannipa", lastEn: "Chanpen", nickname: "แหม่ม", dept: "HRM", position: "เจ้าหน้าที่ทรัพยากรบุคคล",
        hire: "2026-01-12", salary: "25000", birth: "1989-05-30", bank: "กรุงเทพ", account: "2340556781",
        phone: "0845671234", address: "7 หมู่ 2 ตำบลคลองพน อำเภอคลองท่อม จังหวัดกระบี่ 81170",
    },
    {
        key: "nattapon", username: "nattapon", role: "techLead", title: "นาย", first: "ณัฐพล", last: "ทองดี",
        firstEn: "Nattapon", lastEn: "Thongdee", nickname: "บอส", dept: "DEV", position: "หัวหน้าทีมพัฒนาซอฟต์แวร์",
        hire: "2026-01-05", salary: "55000", birth: "1987-09-18", bank: "กสิกรไทย", account: "0429934512",
        phone: "0856712345", address: "199/5 หมู่ 3 ตำบลอ่าวนาง อำเภอเมืองกระบี่ จังหวัดกระบี่ 81180",
        recurring: [{ kind: "earning", label: "ค่าตำแหน่ง", amount: "5000", taxable: true, ssoWage: true, from: "2026-05-01" }],
    },
    {
        key: "piyapong", username: "piyapong", role: "staff", title: "นาย", first: "ปิยะพงษ์", last: "แสงทอง",
        firstEn: "Piyapong", lastEn: "Saengthong", nickname: "ปิง", dept: "DEV", position: "นักพัฒนาซอฟต์แวร์อาวุโส",
        hire: "2026-01-19", salary: "42000", birth: "1991-01-25", bank: "ไทยพาณิชย์", account: "4132245678",
        phone: "0867123456", address: "23/1 ถนนพัฒนา ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
        raise: { from: "2026-07-01", salary: "45000", note: "ปรับเงินเดือนประจำปีตามผลประเมินครึ่งปี" },
    },
    {
        key: "supawadee", username: "supawadee", role: "staff", title: "นางสาว", first: "สุภาวดี", last: "พรหมรักษ์",
        firstEn: "Supawadee", lastEn: "Promrak", nickname: "ฝน", dept: "DEV", position: "นักพัฒนาซอฟต์แวร์",
        hire: "2026-02-02", salary: "28000", birth: "1999-04-09", bank: "กรุงไทย", account: "6790045123",
        phone: "0871234567", address: "56 หมู่ 1 ตำบลเหนือคลอง อำเภอเหนือคลอง จังหวัดกระบี่ 81130",
    },
    {
        key: "chonthicha", username: "chonthicha", role: "staff", title: "นางสาว", first: "ชลธิชา", last: "มีสุข",
        firstEn: "Chonthicha", lastEn: "Meesuk", nickname: "มิ้นท์", dept: "UXD", position: "นักออกแบบ UX/UI",
        hire: "2026-02-02", salary: "32000", birth: "1996-12-03", bank: "กสิกรไทย", account: "0437781290",
        phone: "0882345671", address: "301 ถนนศรีพังงา ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
    },
    {
        key: "kittisak", username: "kittisak", role: "staff", title: "นาย", first: "กิตติศักดิ์", last: "ใจซื่อ",
        firstEn: "Kittisak", lastEn: "Jaisue", nickname: "กิต", dept: "QAT", position: "เจ้าหน้าที่ทดสอบระบบ",
        hire: "2026-03-02", salary: "26000", birth: "1997-08-27", bank: "ออมสิน", account: "020345678912",
        phone: "0893456712", address: "14/7 หมู่ 4 ตำบลไสไทย อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
    },
    {
        key: "weerayut", username: "weerayut", role: "staff", title: "นาย", first: "วีรยุทธ", last: "ปานแก้ว",
        firstEn: "Weerayut", lastEn: "Pankaew", nickname: "เอก", dept: "DEV", position: "นักพัฒนาซอฟต์แวร์",
        hire: "2026-02-02", salary: "30000", birth: "1995-06-11", bank: "กรุงเทพ", account: "2351123987",
        phone: "0814567823", address: "9 ถนนวัชระ ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
        leaves: { lastDay: "2026-08-31", reason: "ลาออกเพื่อไปศึกษาต่อปริญญาโท" },
    },
    {
        key: "apichart", username: "apichart", role: "staff", title: "นาย", first: "อภิชาติ", last: "วงศ์ใหญ่",
        firstEn: "Apichart", lastEn: "Wongyai", nickname: "โอ๊ต", dept: "DEV", position: "นักพัฒนาซอฟต์แวร์",
        hire: "2026-06-01", hireAt: "2026-05-25", salary: "30000", birth: "1998-02-16", bank: "กสิกรไทย", account: "0441209876",
        phone: "0825671234", address: "77/3 หมู่ 6 ตำบลกระบี่น้อย อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
    },
    {
        key: "somporn", username: null, title: "นาง", first: "สมพร", last: "ศรีนวล", nickname: "พร", dept: "ADM",
        position: "แม่บ้าน", hire: "2026-01-05", salary: "12000", birth: "1978-10-05", bank: "ออมสิน", account: "020311223344",
        phone: "0836712345", address: "3 หมู่ 3 ตำบลคลองพน อำเภอคลองท่อม จังหวัดกระบี่ 81170",
    },
    {
        key: "sombat", username: null, title: "นาย", first: "สมบัติ", last: "เพชรรัตน์", nickname: "บัติ", dept: "ADM",
        position: "พนักงานขับรถและธุรการ", hire: "2026-01-05", salary: "15000", birth: "1982-03-21", bank: "กรุงไทย",
        account: "6794432109", phone: "0847123456", address: "21 หมู่ 3 ตำบลคลองพน อำเภอคลองท่อม จังหวัดกระบี่ 81170",
    },
];
EMPLOYEES.forEach((employee, index) => {
    employee.nationalId = thaiId(`1${String(81990 + index).padStart(5, "0")}${String(204310 + index * 37).slice(0, 6)}`);
});

const CLIENTS = {
    andamanResort: {
        client_name: "บริษัท อันดามัน บีช รีสอร์ท จำกัด", client_type: "juristic", client_tax_id: thaiId("081555900123"),
        client_branch_code: "00000", client_contact_name: "คุณมานพ รักษ์ทะเล", client_email: "manop@andamanbeachresort.co.th",
        client_phone: "075638200", client_address: "88 หมู่ 2 ตำบลอ่าวนาง อำเภอเมืองกระบี่ จังหวัดกระบี่ 81180",
        client_credit_days: 30, client_wht_rate: "3", client_language: "th",
    },
    krabiHoliday: {
        client_name: "บริษัท กระบี่ ฮอลิเดย์ ทัวร์ จำกัด", client_type: "juristic", client_tax_id: thaiId("081555700456"),
        client_branch_code: "00000", client_contact_name: "คุณอรวรรณ ใจดี", client_email: "account@krabiholidaytour.com",
        client_phone: "075612345", client_address: "12/3 ถนนอุตรกิจ ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
        client_credit_days: 15, client_wht_rate: "3", client_language: "th",
    },
    siamPalm: {
        client_name: "บริษัท สยามปาล์ม อินดัสทรี จำกัด", client_type: "juristic", client_tax_id: thaiId("081556100789"),
        client_branch_code: "00000", client_contact_name: "คุณวิชัย สุขประเสริฐ (ผู้จัดการโรงงาน)",
        client_email: "it@siampalm-industry.co.th", client_phone: "075699100",
        client_address: "199 หมู่ 8 ตำบลคลองท่อมเหนือ อำเภอคลองท่อม จังหวัดกระบี่ 81120",
        client_credit_days: 45, client_wht_rate: "3", client_language: "th",
    },
    andamanDigital: {
        client_name: "Andaman Digital Pte. Ltd.", client_type: "juristic", client_contact_name: "Mr. Daniel Tan",
        client_email: "daniel.tan@andamandigital.sg", client_phone: "+6562345678",
        client_address: "10 Anson Road, #22-02 International Plaza, Singapore 079903", client_credit_days: 30,
        client_wht_rate: "0", client_language: "en",
    },
    smileClinic: {
        client_name: "คลินิกทันตกรรมยิ้มสดใส", client_type: "individual", client_tax_id: thaiId("381990012345"),
        client_contact_name: "ทพญ.อรอุมา ศรีวงศ์", client_email: "smile.krabi.dental@gmail.com", client_phone: "0957891234",
        client_address: "55/1 ถนนมหาราช ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000", client_credit_days: 0,
        client_wht_rate: "0", client_language: "th",
    },
    goldenSea: {
        client_name: "บริษัท โกลเด้นซี โลจิสติกส์ จำกัด", client_type: "juristic", client_tax_id: thaiId("083556000321"),
        client_branch_code: "00000", client_contact_name: "คุณปกรณ์ วัฒนกุล", client_email: "pakorn@goldensea-logistics.com",
        client_phone: "076234567", client_address: "45/9 ถนนเทพกระษัตรี ตำบลรัษฎา อำเภอเมืองภูเก็ต จังหวัดภูเก็ต 83000",
        client_credit_days: 30, client_wht_rate: "3", client_language: "th",
    },
    aoNangSeafood: {
        client_name: "ห้างหุ้นส่วนจำกัด อ่าวนาง ซีฟู้ด", client_type: "juristic", client_tax_id: thaiId("081353100654"),
        client_branch_code: "00000", client_contact_name: "คุณสมศักดิ์ ทะเลงาม", client_email: "aonangseafood@gmail.com",
        client_phone: "0819876543", client_address: "3/21 หมู่ 2 ตำบลอ่าวนาง อำเภอเมืองกระบี่ จังหวัดกระบี่ 81180",
        client_credit_days: 7, client_wht_rate: "3", client_language: "th",
    },
};

const VENDORS = {
    cloudHost: {
        vd_type: "juristic", vd_name: "บริษัท คลาวด์โฮสต์ (ประเทศไทย) จำกัด", vd_tax_id: thaiId("010556300147"),
        vd_branch_code: "00000", vd_address: "999/9 อาคารสยามทาวเวอร์ ชั้น 21 ถนนพระราม 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330",
        vd_contact_name: "ฝ่ายบริการลูกค้า", vd_email: "billing@cloudhost.co.th", vd_phone: "021234567", vd_credit_days: 0,
        vd_default_income_type: "SERVICE", vd_default_category_id: 2,
    },
    andamanNet: {
        vd_type: "juristic", vd_name: "บริษัท อันดามัน อินเทอร์เน็ต จำกัด", vd_tax_id: thaiId("081556200258"),
        vd_branch_code: "00000", vd_address: "17 ถนนกระบี่ ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000",
        vd_email: "billing@andamannet.co.th", vd_phone: "075600700", vd_credit_days: 15, vd_default_category_id: 7,
    },
    pea: {
        vd_type: "juristic", vd_name: "การไฟฟ้าส่วนภูมิภาค สาขาคลองท่อม",
        vd_address: "ถนนเพชรเกษม ตำบลคลองท่อมใต้ อำเภอคลองท่อม จังหวัดกระบี่ 81120", vd_phone: "1129", vd_credit_days: 7,
        vd_default_category_id: 7,
    },
    landlord: {
        vd_type: "individual", vd_name: "นายประสิทธิ์ ใจบุญ", vd_tax_id: thaiId("381990054321"),
        vd_address: "113 หมู่ 3 ตำบลคลองพน อำเภอคลองท่อม จังหวัดกระบี่ 81170", vd_phone: "0814441234",
        vd_bank_name: "กรุงไทย", vd_bank_account_no: "7901122334", vd_bank_account_name: "ประสิทธิ์ ใจบุญ", vd_credit_days: 5,
        vd_default_income_type: "RENT", vd_default_category_id: 6, vd_notes: "เจ้าของอาคารสำนักงาน สัญญาเช่า 3 ปี (ม.ค. 2026 – ธ.ค. 2028)",
    },
    itShop: {
        vd_type: "juristic", vd_name: "บริษัท กระบี่ ไอที ซัพพลาย จำกัด", vd_tax_id: thaiId("081556400369"), vd_branch_code: "00000",
        vd_address: "61 ถนนมหาราช ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000", vd_contact_name: "คุณเอกชัย",
        vd_email: "sales@krabiitsupply.com", vd_phone: "075611222", vd_credit_days: 30, vd_default_category_id: 11,
    },
    freelanceDesigner: {
        vd_type: "individual", vd_name: "นางสาวพิมพ์ชนก แสงดาว", vd_tax_id: thaiId("181990067890"),
        vd_address: "8/2 ถนนเหมราช ตำบลตลาดเหนือ อำเภอเมืองภูเก็ต จังหวัดภูเก็ต 83000", vd_email: "pimchanok.design@gmail.com",
        vd_phone: "0891239876", vd_bank_name: "กสิกรไทย", vd_bank_account_no: "0459988776", vd_bank_account_name: "พิมพ์ชนก แสงดาว",
        vd_credit_days: 7, vd_default_income_type: "SERVICE", vd_default_category_id: 1, vd_notes: "ฟรีแลนซ์ออกแบบภาพประกอบและไอคอน",
    },
    accountingFirm: {
        vd_type: "juristic", vd_name: "สำนักงานบัญชี กระบี่ แอคเคาน์ติ้ง", vd_tax_id: thaiId("081353200741"), vd_branch_code: "00000",
        vd_address: "40/5 ถนนพิศาลประสงค์ ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000", vd_email: "krabiaccounting@gmail.com",
        vd_phone: "075620333", vd_credit_days: 15, vd_default_income_type: "PROFESSIONAL", vd_default_category_id: 12,
        vd_notes: "ทำบัญชีและยื่นภาษีรายเดือน",
    },
};

// หมวดสินค้า/บริการ และรายการขาย
const PRODUCT_CATEGORIES = ["พัฒนาซอฟต์แวร์", "ออกแบบ UX/UI", "โฮสติ้งและดูแลระบบ", "ฝึกอบรมและให้คำปรึกษา"];
const PRODUCTS = [
    { key: "analysis", code: "SV-ANL", name: "วิเคราะห์และออกแบบระบบ", unit: "งาน", price: "25000", category: 0 },
    { key: "webDev", code: "SV-WEB", name: "พัฒนาเว็บแอปพลิเคชัน", unit: "Man-day", price: "4500", category: 0 },
    { key: "mobileDev", code: "SV-MOB", name: "พัฒนาแอปพลิเคชันมือถือ (iOS / Android)", unit: "Man-day", price: "5000", category: 0 },
    { key: "testing", code: "SV-QA", name: "ทดสอบระบบและแก้ไขข้อผิดพลาด", unit: "Man-day", price: "3500", category: 0 },
    { key: "uxui", code: "DS-UI", name: "ออกแบบ UX/UI", unit: "หน้าจอ", price: "2500", category: 1 },
    { key: "deploy", code: "OP-DEP", name: "ติดตั้งระบบบนเซิร์ฟเวอร์และตั้งค่าความปลอดภัย", unit: "งาน", price: "8000", category: 2 },
    { key: "maintenance", code: "OP-MA", name: "บริการดูแลระบบรายเดือน", unit: "เดือน", price: "6000", category: 2 },
    { key: "hosting", code: "OP-HOST", name: "Cloud Hosting รายปี", unit: "ปี", price: "18000", category: 2 },
    { key: "domain", code: "OP-DOM", name: "จดโดเมน .com รายปี", unit: "ปี", price: "650", category: 2 },
    { key: "training", code: "TR-USE", name: "ฝึกอบรมการใช้งานระบบ", unit: "ครั้ง", price: "7500", category: 3 },
];

// วันหยุดบริษัท ปี 2026 (ตามวันหยุดราชการ)
const HOLIDAYS_2026 = [
    ["2026-01-01", "วันขึ้นปีใหม่"],
    ["2026-03-03", "วันมาฆบูชา"],
    ["2026-04-06", "วันจักรี"],
    ["2026-04-13", "วันสงกรานต์"],
    ["2026-04-14", "วันสงกรานต์"],
    ["2026-04-15", "วันสงกรานต์"],
    ["2026-05-01", "วันแรงงานแห่งชาติ"],
    ["2026-05-04", "วันฉัตรมงคล"],
    ["2026-06-01", "ชดเชยวันวิสาขบูชา"],
    ["2026-06-03", "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี"],
    ["2026-07-28", "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว"],
    ["2026-07-29", "วันอาสาฬหบูชา"],
    ["2026-07-30", "วันเข้าพรรษา"],
    ["2026-08-12", "วันแม่แห่งชาติ"],
    ["2026-10-13", "วันนวมินทรมหาราช"],
    ["2026-10-23", "วันปิยมหาราช"],
    ["2026-12-07", "ชดเชยวันพ่อแห่งชาติ"],
    ["2026-12-10", "วันรัฐธรรมนูญ"],
    ["2026-12-31", "วันสิ้นปี"],
];

module.exports = {
    thaiId,
    COMPANY,
    COMPANY_LOGO,
    HEAD_OFFICE,
    BANK_ACCOUNT,
    DEPARTMENTS,
    ROLES,
    OWNER,
    EMPLOYEES,
    CLIENTS,
    VENDORS,
    PRODUCT_CATEGORIES,
    PRODUCTS,
    HOLIDAYS_2026,
};
