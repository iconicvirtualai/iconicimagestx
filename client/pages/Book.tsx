import * as React from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import {
  Home, Building2, Check, ChevronRight, ChevronLeft, Camera,
  Video, Plane, Box, Sparkles, Smartphone, X, Plus, Minus, Info,
} from "lucide-react";

// âââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
interface ServiceItem {
  id: string;
  name: string;
  category: string;
  type: string;
  price: number;
  duration: number;
  description: string;
  isUpsell: boolean;
  upsellMessage: string;
  isPremium: boolean;
  sortOrder: number;
  isActive: boolean;
}

interface CartItem {
  serviceId: string;
  name: string;
  price: number;
  duration: number;
  qty: number;
}

type Step = "type" | "services" | "details" | "review";

const SERVICE_ICONS: Record<string, any> = {
  photography: Camera, videography: Video, aerial: Plane,
  "3d_tour": Box, staging: Sparkles, social: Smartphone,
  branding: Sparkles, reel: Video,
};
// âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers âââ Helpers 
 function generateOrderNumber(): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const rand = String(Math.floor(Math.random()*999)+1).padStart(3,"0");
  return `ORD-${date}-${rand}`;
}
// âââ Component âââ Component 