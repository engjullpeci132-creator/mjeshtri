export type UserRole = 'client' | 'provider' | 'admin';

export interface Location {
  lat: number;
  lng: number;
  address: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  realName?: string;
  age?: number;
  origin?: string;
  address?: string;
  photoURL: string;
  coverURL?: string;
  role: UserRole;
  isPro?: boolean;
  subscriptionExpires?: string;
  location?: Location;
  createdAt: string;
}

export type ServiceCategory = 'driver' | 'gardener' | 'cleaner' | 'plumber' | 'electrician' | 'painter' | 'carpenter' | 'mechanic' | 'tutor' | 'babysitter' | 'it-support' | 'photographer' | 'other';

export interface ServiceListing {
  id: string;
  providerId: string;
  providerName: string;
  category: ServiceCategory;
  title: string;
  description: string;
  pricePerHour: number;
  location: Location;
  rating: number;
  reviewCount: number;
  images: string[]; // Max 2 for non-pro, maybe more for pro? User said "2 photo on they lists they create"
  experienceYears?: number;
  availability?: string;
  isProviderPro?: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  participants: string[];
  lastMessage?: string;
  updatedAt: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Booking {
  id: string;
  clientId: string;
  clientName: string;
  serviceId: string;
  providerId: string;
  status: BookingStatus;
  scheduledAt: string;
  hours: number;
  totalPrice: number;
  serviceFee: number;
  createdAt: string;
}

export interface Review {
  id: string;
  serviceId: string;
  clientId: string;
  clientName: string;
  rating: number;
  comment: string;
  createdAt: string;
}
