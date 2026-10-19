import { redirect } from "next/navigation";

// /people → หน้าของฉัน (เมนูหลัก "บุคคล" เป็นปุ่มกางเมนูย่อย แต่ลิงก์เก่า/พิมพ์ URL เองยังมาถึงได้)
export default function PeopleIndexPage() {
    redirect("/people/me");
}
