import {
  LayoutDashboard,
  Building2,
  Users,
  UsersRound,
  WalletCards,
  CalendarDays,
  Wrench,
  MessageSquareText,
  FileText,
  Camera,
  ShieldCheck,
  Settings,
} from "lucide-react";

import Dashboard from "../pages/Dashboard";
import Apartments from "../pages/Apartments";
import Tenants from "../pages/Tenants";
import Finance from "../pages/Finance";
import Calendar from "../pages/Calendar";
import Repairs from "../pages/Repairs";
import NoticeBoard from "../pages/NoticeBoard";
import Chat from "../pages/Chat";
import Documents from "../pages/Documents";
import Cameras from "../pages/Cameras";
import Security from "../pages/Security";
import UsersPage from "../pages/Users";
import HouseSettings from "../pages/HouseSettings";

export const MENU_ITEMS = [
  {
    key: "dashboard",
    title: "Přehled",
    icon: LayoutDashboard,
    component: Dashboard,
  },
  {
    key: "apartments",
    title: "Byty",
    icon: Building2,
    component: Apartments,
  },
  {
    key: "tenants",
    title: "Nájemníci",
    icon: Users,
    component: Tenants,
  },
  {
    key: "finance",
    title: "Finance",
    icon: WalletCards,
    component: Finance,
  },
  {
    key: "calendar",
    title: "Kalendář",
    icon: CalendarDays,
    component: Calendar,
  },
  {
    key: "repairs",
    title: "Opravy",
    icon: Wrench,
    component: Repairs,
  },
  {
    key: "notice-board",
    title: "Nástěnka",
    icon: MessageSquareText,
    component: NoticeBoard,
  },
  {
    key: "chat",
    title: "Online chat",
    icon: MessageSquareText,
    component: Chat,
  },
  {
    key: "documents",
    title: "Dokumenty",
    icon: FileText,
    component: Documents,
  },
  {
    key: "cameras",
    title: "Kamery",
    icon: Camera,
    component: Cameras,
  },
  {
    key: "security",
    title: "Zabezpečení",
    icon: ShieldCheck,
    component: Security,
  },
  {
    key: "users",
    title: "Uživatelé",
    icon: UsersRound,
    component: UsersPage,
  },
  {
    key: "house-settings",
    title: "Nastavení domu",
    icon: Settings,
    component: HouseSettings,
  },
];
