import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Star, 
  User, 
  Briefcase, 
  Calendar, 
  Clock, 
  DollarSign, 
  Filter, 
  Plus, 
  LogOut, 
  LogIn,
  ChevronRight,
  Shield,
  CheckCircle,
  X,
  Menu,
  Navigation,
  Image as ImageIcon,
  Map as MapIcon,
  List as ListIcon,
  MessageSquare,
  Edit2,
  Trash2,
  PlusCircle,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { KOSOVO_CITIES } from './constants';

// Fix Leaflet marker icon issue
const markerIcon = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const markerShadow = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  getDoc, 
  setDoc,
  serverTimestamp,
  orderBy,
  limit,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  UserProfile, 
  ServiceListing, 
  Booking, 
  Review, 
  Location, 
  ServiceCategory,
  UserRole,
  BookingStatus,
  ChatRoom,
  Message
} from './types';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Error handling as per guidelines
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || 'unauthenticated',
      email: auth.currentUser?.email || 'no-email',
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || 'no-tenant',
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || 'no-display-name',
        email: provider.email || 'no-email',
        photoUrl: provider.photoURL || 'no-photo'
      })) || []
    },
    operationType,
    path
  };
  console.error(`Firestore Error [${operationType}] on [${path}]:`, errInfo.error, errInfo);
  // We don't throw here to avoid crashing the whole app, but we log it clearly
}

// Distance calculation (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

const categoryLabels = {
  driver: 'Shofer',
  gardener: 'Kopshtar',
  cleaner: 'Pastrues',
  plumber: 'Putier',
  electrician: 'Elektricist',
  painter: 'Pikturues',
  carpenter: 'Zdrukthëtar',
  mechanic: 'Automekanik',
  tutor: 'Mësimdhënës',
  babysitter: 'Dado',
  'it-support': 'Mbështetje IT',
  photographer: 'Fotograf',
  other: 'Tjetër'
};

const categories: ServiceCategory[] = ['driver', 'gardener', 'cleaner', 'plumber', 'electrician', 'painter', 'carpenter', 'mechanic', 'tutor', 'babysitter', 'it-support', 'photographer', 'other'];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [services, setServices] = useState<ServiceListing[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | 'all'>('all');
  const [view, setView] = useState<'home' | 'search' | 'bookings' | 'profile' | 'create-service' | 'public-profile'>('home');
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceListing | null>(null);
  const [editingService, setEditingService] = useState<ServiceListing | null>(null);
  const [showMapView, setShowMapView] = useState(false);
  const [bookingHours, setBookingHours] = useState(1);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [activeChat, setActiveChat] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [editProfileData, setEditProfileData] = useState({ 
    displayName: '', 
    photoURL: '', 
    coverURL: '',
    realName: '',
    age: 0,
    origin: '',
    address: ''
  });
  const [isUpgrading, setIsUpgrading] = useState(false);

  // Test connection to Firestore
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            // Create initial profile
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'User',
              photoURL: firebaseUser.photoURL || '',
              role: 'client',
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            address: 'Vendndodhja Aktuale'
          };
          setUserLocation(location);
          
          // Auto-update profile location if authenticated
          if (user && profile) {
            try {
              await updateDoc(doc(db, 'users', user.uid), { location });
            } catch (error) {
              console.error("Error updating profile location:", error);
            }
          }
        },
        (error) => console.error("Geolocation error:", error)
      );
    }
  }, [user, profile]);

  // Fetch Services
  useEffect(() => {
    if (!isAuthReady) return;
    const q = query(collection(db, 'services'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const servicesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceListing));
      // Prioritize PRO users
      const sortedServices = servicesData.sort((a, b) => {
        if (a.isProviderPro && !b.isProviderPro) return -1;
        if (!a.isProviderPro && b.isProviderPro) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setServices(sortedServices);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'services');
    });
    return () => unsubscribe();
  }, [isAuthReady]);

  // Fetch User Bookings
  useEffect(() => {
    if (!user || !isAuthReady || !profile) return;
    const q = query(
      collection(db, 'bookings'), 
      where(profile.role === 'provider' ? 'providerId' : 'clientId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(bookingsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });
    return () => unsubscribe();
  }, [user, profile, isAuthReady]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.log("Login popup closed or cancelled.");
      } else {
        console.error("Login error:", error);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('home');
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const filteredServices = useMemo(() => {
    return services.filter(service => {
      const matchesSearch = service.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           service.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || service.category === selectedCategory;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => {
      if (!userLocation) return 0;
      const distA = calculateDistance(userLocation.lat, userLocation.lng, a.location.lat, a.location.lng);
      const distB = calculateDistance(userLocation.lat, userLocation.lng, b.location.lat, b.location.lng);
      return distA - distB;
    });
  }, [services, searchQuery, selectedCategory, userLocation]);

  const handleBooking = async (serviceId: string, hours: number) => {
    if (!user || !profile || !selectedService) return;
    
    const totalPrice = selectedService.pricePerHour * hours;
    const serviceFee = totalPrice * 0.1; // 10% platform fee

    const newBooking: Omit<Booking, 'id'> = {
      clientId: user.uid,
      clientName: profile.displayName,
      serviceId: selectedService.id,
      providerId: selectedService.providerId,
      status: 'pending',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      hours: hours,
      totalPrice: totalPrice + serviceFee,
      serviceFee: serviceFee,
      createdAt: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, 'bookings'), newBooking);
      setIsModalOpen(false);
      setSelectedService(null);
      setView('bookings');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
    }
  };

  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), editProfileData);
      setProfile({ ...profile, ...editProfileData });
      setIsEditingProfile(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleUpgradeToPro = async () => {
    if (!user || !profile) return;
    setIsUpgrading(true);
    try {
      const expires = new Date();
      expires.setMonth(expires.getMonth() + 1); // 1 month subscription
      const update = {
        isPro: true,
        subscriptionExpires: expires.toISOString()
      };
      await updateDoc(doc(db, 'users', user.uid), update);
      setProfile({ ...profile, ...update });
      alert("Urime! Tani jeni anëtar PRO.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsUpgrading(false);
    }
  };

  const startChat = async (providerId: string) => {
    if (!user) {
      alert("Ju lutem hyni në llogari për të biseduar.");
      return;
    }
    if (user.uid === providerId) return;

    const chatId = [user.uid, providerId].sort().join('_');
    const chatRef = doc(db, 'chats', chatId);
    
    try {
      const chatDoc = await getDoc(chatRef);
      if (!chatDoc.exists()) {
        const newChat: ChatRoom = {
          id: chatId,
          participants: [user.uid, providerId],
          updatedAt: new Date().toISOString()
        };
        await setDoc(chatRef, newChat);
        setActiveChat(newChat);
      } else {
        setActiveChat({ id: chatId, ...chatDoc.data() } as ChatRoom);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  const sendMessage = async (text: string) => {
    if (!activeChat || !user || !text.trim()) return;
    
    const messageData = {
      chatId: activeChat.id,
      senderId: user.uid,
      text: text.trim(),
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'chats', activeChat.id, 'messages'), messageData);
      await updateDoc(doc(db, 'chats', activeChat.id), {
        lastMessage: text.trim(),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${activeChat.id}/messages`);
    }
  };

  useEffect(() => {
    if (!activeChat) return;
    const q = query(collection(db, 'chats', activeChat.id, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    });
    return () => unsubscribe();
  }, [activeChat]);

  const handleDeleteService = async (serviceId: string) => {
    if (!window.confirm("A jeni të sigurt që dëshironi të fshini këtë shërbim?")) return;
    try {
      await deleteDoc(doc(db, 'services', serviceId));
      if (selectedService?.id === serviceId) setSelectedService(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `services/${serviceId}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
              <div className="bg-indigo-600 p-2 rounded-xl">
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-indigo-950">Mjeshtri</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => setView('home')} className={cn("text-sm font-medium transition-colors", view === 'home' ? "text-indigo-600" : "text-slate-600 hover:text-indigo-600")}>Ballina</button>
              <button onClick={() => setView('search')} className={cn("text-sm font-medium transition-colors", view === 'search' ? "text-indigo-600" : "text-slate-600 hover:text-indigo-600")}>Gjej Shërbime</button>
              {user && (
                <>
                  <button onClick={() => setView('bookings')} className={cn("text-sm font-medium transition-colors", view === 'bookings' ? "text-indigo-600" : "text-slate-600 hover:text-indigo-600")}>Rezervimet e Mia</button>
                  <button onClick={() => setView('profile')} className={cn("text-sm font-medium transition-colors", view === 'profile' ? "text-indigo-600" : "text-slate-600 hover:text-indigo-600")}>Profili</button>
                </>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={() => {
                  setShowMapView(!showMapView);
                  if (view !== 'search') setView('search');
                }}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-2 text-sm font-bold"
                title={showMapView ? 'Shiko Listën' : 'Shiko Hartën'}
              >
                {showMapView ? <ListIcon className="w-5 h-5" /> : <MapIcon className="w-5 h-5" />}
                <span className="hidden sm:inline">{showMapView ? 'Lista' : 'Harta'}</span>
              </button>
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block text-right">
                    <p className="text-xs font-semibold text-slate-900">{profile?.displayName}</p>
                    <p className="text-[10px] text-slate-500 capitalize">{profile?.role === 'client' ? 'Klient' : profile?.role === 'provider' ? 'Ofrues' : 'Admin'}</p>
                  </div>
                  <img 
                    src={profile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                    className="w-8 h-8 rounded-full border border-slate-200"
                    alt="Avatar"
                    referrerPolicy="no-referrer"
                  />
                  <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  <LogIn className="w-4 h-4" />
                  Hyni
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'home' && (
          <div className="space-y-12">
            {/* Hero */}
            <section className="relative rounded-3xl overflow-hidden bg-indigo-900 py-20 px-8 text-center text-white">
              <div className="absolute inset-0 opacity-20 bg-[url('https://picsum.photos/seed/city/1920/1080')] bg-cover bg-center" />
              <div className="relative z-10 max-w-3xl mx-auto space-y-6">
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-4xl md:text-6xl font-extrabold tracking-tight"
                >
                  Gjeni ndihmën që ju nevojitet, pikërisht në qytetin tuaj.
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-lg text-indigo-100"
                >
                  Punësoni shoferë të besuar, kopshtarë, pastrues dhe më shumë. Filtroni sipas distancës dhe vlerësimeve.
                </motion.p>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-col sm:flex-row gap-4 justify-center pt-4"
                >
                  <button 
                    onClick={() => setView('search')}
                    className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Search className="w-5 h-5" />
                    Shfleto Shërbimet
                  </button>
                  {!user && (
                    <button 
                      onClick={handleLogin}
                      className="bg-indigo-500/30 backdrop-blur-md border border-indigo-400/50 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-500/40 transition-all"
                    >
                      Bashkohu si Ofrues
                    </button>
                  )}
                </motion.div>
              </div>
            </section>

            {/* Categories */}
            <section className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Kategoritë Popullore</h2>
                  <p className="text-slate-500">Çfarë po kërkoni sot?</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setView('search');
                    }}
                    className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group text-center"
                  >
                    <div className="bg-slate-50 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-50 transition-colors">
                      <Briefcase className="w-6 h-6 text-slate-600 group-hover:text-indigo-600" />
                    </div>
                    <span className="text-sm font-bold capitalize text-slate-700 group-hover:text-indigo-700">{categoryLabels[cat as keyof typeof categoryLabels]}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Featured Services */}
            <section className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Shërbimet Pranë Juaj</h2>
                  <p className="text-slate-500">Profesionistët më të vlerësuar pranë jush</p>
                </div>
                <button onClick={() => setView('search')} className="text-indigo-600 font-bold text-sm flex items-center gap-1 hover:gap-2 transition-all">
                  Shiko të gjitha <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {services.slice(0, 3).map((service) => (
                  <ServiceCard 
                    key={service.id} 
                    service={service} 
                    userLocation={userLocation}
                    onView={() => setSelectedService(service)}
                    onHire={() => {
                      setSelectedService(service);
                      setIsModalOpen(true);
                    }}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {view === 'search' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Kërko për shërbime..." 
                  className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                <button 
                  onClick={() => setSelectedCategory('all')}
                  className={cn(
                    "px-6 py-3 rounded-full text-sm font-bold whitespace-nowrap transition-all",
                    selectedCategory === 'all' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
                  )}
                >
                  Të gjitha
                </button>
                {categories.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-6 py-3 rounded-full text-sm font-bold whitespace-nowrap transition-all capitalize",
                      selectedCategory === cat ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
                    )}
                  >
                    {categoryLabels[cat as keyof typeof categoryLabels]}
                  </button>
                ))}
              </div>
            </div>

            {showMapView ? (
              <div className="h-[600px] rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative z-0">
                <MapContainer center={[userLocation?.lat || 41.3275, userLocation?.lng || 19.8187]} zoom={13} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {filteredServices.map(service => (
                    <Marker key={service.id} position={[service.location.lat, service.location.lng]}>
                      <Popup>
                        <div className="p-2 min-w-[200px]">
                          <h4 className="font-bold text-slate-900">{service.title}</h4>
                          <p className="text-xs text-slate-500 mb-2">{categoryLabels[service.category as keyof typeof categoryLabels]}</p>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-sm font-bold text-indigo-600">${service.pricePerHour}/orë</p>
                            <button 
                              onClick={() => setSelectedService(service)}
                              className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-600 transition-all"
                            >
                              Shiko Detajet
                            </button>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  {userLocation && (
                    <Marker position={[userLocation.lat, userLocation.lng]}>
                      <Popup>Vendndodhja Juaj</Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredServices.length > 0 ? (
                  filteredServices.map((service) => (
                    <ServiceCard 
                      key={service.id} 
                      service={service} 
                      userLocation={userLocation}
                      onView={() => setSelectedService(service)}
                      onHire={() => setSelectedService(service)}
                      onEdit={() => {
                        setEditingService(service);
                        setView('create-service');
                      }}
                      isOwner={user?.uid === service.providerId}
                    />
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center space-y-4">
                    <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                      <Search className="w-10 h-10 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">Nuk u gjet asnjë shërbim</h3>
                    <p className="text-slate-500">Provoni të rregulloni kërkimin ose filtrat tuaj</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'bookings' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-extrabold text-slate-900">Rezervimet e Mia</h2>
              <div className="flex gap-2">
                <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {bookings.length} Gjithsej
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {bookings.length > 0 ? (
                bookings.map((booking) => (
                  <BookingCard 
                    key={booking.id} 
                    booking={booking} 
                    isProvider={profile?.role === 'provider'}
                    onUpdateStatus={updateBookingStatus}
                  />
                ))
              ) : (
                <div className="py-20 text-center space-y-4 bg-white rounded-3xl border border-slate-200 border-dashed">
                  <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-xl font-bold text-slate-900">Asnjë rezervim ende</h3>
                  <p className="text-slate-500">Shërbimet tuaja të planifikuara do të shfaqen këtu</p>
                  <button onClick={() => setView('search')} className="text-indigo-600 font-bold">Gjeni një shërbim</button>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'profile' && profile && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div 
                className="h-48 bg-indigo-600 bg-cover bg-center" 
                style={{ backgroundImage: profile.coverURL ? `url(${profile.coverURL})` : 'none' }}
              />
              <div className="px-8 pb-8">
                <div className="relative -mt-16 mb-6 flex justify-between items-end">
                  <img 
                    src={profile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} 
                    className="w-32 h-32 rounded-3xl border-4 border-white shadow-xl object-cover"
                    alt="Profile"
                    referrerPolicy="no-referrer"
                  />
                  {!isEditingProfile && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setEditProfileData({ 
                            displayName: profile.displayName, 
                            photoURL: profile.photoURL, 
                            coverURL: profile.coverURL || '',
                            realName: profile.realName || '',
                            age: profile.age || 0,
                            origin: profile.origin || '',
                            address: profile.address || ''
                          });
                          setIsEditingProfile(true);
                        }}
                        className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edito Profilin
                      </button>
                    </div>
                  )}
                </div>

                {isEditingProfile ? (
                  <form onSubmit={handleUpdateProfile} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Emri i Shfaqur (Pseudonimi)</label>
                        <input 
                          type="text"
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={editProfileData.displayName}
                          onChange={(e) => setEditProfileData({ ...editProfileData, displayName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Emri i Plotë (Real)</label>
                        <input 
                          type="text"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={editProfileData.realName}
                          onChange={(e) => setEditProfileData({ ...editProfileData, realName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Mosha</label>
                        <input 
                          type="number"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={editProfileData.age}
                          onChange={(e) => setEditProfileData({ ...editProfileData, age: parseInt(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Vendlindja (Qyteti)</label>
                        <select 
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={editProfileData.origin}
                          onChange={(e) => setEditProfileData({ ...editProfileData, origin: e.target.value })}
                        >
                          <option value="">Zgjidh qytetin</option>
                          {KOSOVO_CITIES.map(city => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700">Adresa e Saktë</label>
                        <input 
                          type="text"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={editProfileData.address}
                          onChange={(e) => setEditProfileData({ ...editProfileData, address: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">URL e Fotos së Profilit</label>
                        <input 
                          type="url"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={editProfileData.photoURL}
                          onChange={(e) => setEditProfileData({ ...editProfileData, photoURL: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">URL e Fotos së Ballinës</label>
                        <input 
                          type="url"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={editProfileData.coverURL}
                          onChange={(e) => setEditProfileData({ ...editProfileData, coverURL: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        type="submit"
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
                      >
                        Ruaj Ndryshimet
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                      >
                        Anulo
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-3xl font-bold text-slate-900">{profile.displayName}</h2>
                          {profile.isPro && (
                            <div className="flex flex-col">
                              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200 flex items-center gap-1">
                                <Zap className="w-3 h-3 fill-amber-500" />
                                PRO
                              </span>
                              {profile.subscriptionExpires && (
                                <span className="text-[9px] text-amber-600 font-bold mt-1">
                                  Skadon pas {Math.ceil((new Date(profile.subscriptionExpires).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} ditësh
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-slate-500">{profile.email}</p>
                      </div>
                      <span className="bg-indigo-100 text-indigo-700 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        {profile.role === 'client' ? 'Klient' : profile.role === 'provider' ? 'Ofrues' : 'Admin'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Emri Real</p>
                        <p className="font-bold text-slate-900">{profile.realName || 'I paplotësuar'}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Mosha</p>
                        <p className="font-bold text-slate-900">{profile.age ? `${profile.age} vjeç` : 'I paplotësuar'}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Vendlindja</p>
                        <p className="font-bold text-slate-900">{profile.origin || 'I paplotësuar'}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Adresa</p>
                        <p className="font-bold text-slate-900 truncate">{profile.address || 'I paplotësuar'}</p>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4">
                      <h3 className="font-bold text-slate-900">Veprime të Shpejta</h3>
                      <div className="flex gap-4">
                        <button 
                          onClick={async () => {
                            const newRole = profile.role === 'client' ? 'provider' : 'client';
                            await updateDoc(doc(db, 'users', profile.uid), { role: newRole });
                            setProfile({ ...profile, role: newRole as UserRole });
                          }}
                          className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" />
                          Kalo në {profile.role === 'client' ? 'Ofrues' : 'Klient'}
                        </button>
                      </div>
                    </div>

                    {!isEditingProfile && profile.role === 'provider' && (
                      <div className="pt-12 space-y-8 border-t border-slate-100 mt-12">
                        <div className="p-8 bg-indigo-50 rounded-[2.5rem] border border-indigo-100 flex flex-col md:flex-row justify-between items-center gap-6">
                          <div className="space-y-2">
                            <h3 className="text-2xl font-black text-indigo-900 tracking-tight">Plani PRO</h3>
                            <p className="text-indigo-600 font-medium">Merrni më shumë shikime dhe listime të pakufizuara.</p>
                            {profile.isPro && profile.subscriptionExpires && (
                              <div className="flex items-center gap-2 mt-4 text-indigo-900 font-bold text-sm">
                                <Clock className="w-4 h-4" />
                                Skadon më: {format(new Date(profile.subscriptionExpires), 'dd MMM yyyy')}
                              </div>
                            )}
                          </div>
                          <button 
                            disabled={isUpgrading}
                            onClick={handleUpgradeToPro}
                            className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 whitespace-nowrap"
                          >
                            <Zap className="w-5 h-5 fill-white" />
                            {profile.isPro ? 'Rinovoni Planin ($19.99/muaj)' : 'Kaloni në PRO ($19.99/muaj)'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
                            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                              <Star className="w-6 h-6 fill-indigo-600" />
                            </div>
                            <h4 className="font-black text-slate-900">Prioritet në Kërkim</h4>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">Shërbimet tuaja do të shfaqen të parat në listë për të gjithë klientët.</p>
                          </div>
                          <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
                            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                              <PlusCircle className="w-6 h-6" />
                            </div>
                            <h4 className="font-black text-slate-900">Listime pa Limit</h4>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">Shtoni sa më shumë shërbime që dëshironi pa asnjë kufizim.</p>
                          </div>
                          <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
                            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                            <h4 className="font-black text-slate-900">Më shumë Foto</h4>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">Shtoni deri në 5 foto për çdo listim për të treguar punën tuaj.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {profile.role === 'provider' && (
                      <div className="pt-8 space-y-6">
                        <div className="flex justify-between items-center">
                          <h3 className="text-xl font-bold text-slate-900">Listimet e Mia</h3>
                        <button 
                          onClick={() => {
                            if (!profile.realName || !profile.age || !profile.address || !profile.origin) {
                              alert("Ju lutem plotësoni të gjitha të dhënat e profilit (Emri Real, Mosha, Adresa, Vendlindja) para se të shtoni një shërbim.");
                              setIsEditingProfile(true);
                              setEditProfileData({ 
                                displayName: profile.displayName, 
                                photoURL: profile.photoURL, 
                                coverURL: profile.coverURL || '',
                                realName: profile.realName || '',
                                age: profile.age || 0,
                                origin: profile.origin || '',
                                address: profile.address || ''
                              });
                              return;
                            }
                            const userServices = services.filter(s => s.providerId === user?.uid);
                            if (!profile.isPro && userServices.length >= 1) {
                              alert("Si anëtar i thjeshtë, mund të keni vetëm 1 listim. Për më shumë, kaloni në planin PRO.");
                              return;
                            }
                            setEditingService(null);
                            setView('create-service');
                          }}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
                        >
                          <Plus className="w-4 h-4" />
                          Shto Listim
                        </button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          {services.filter(s => s.providerId === user?.uid).map(service => (
                            <ServiceCard 
                              key={service.id}
                              service={service}
                              userLocation={userLocation}
                              onView={() => setSelectedService(service)}
                              onHire={() => setSelectedService(service)}
                              onEdit={() => {
                                setEditingService(service);
                                setView('create-service');
                              }}
                              onDelete={() => handleDeleteService(service.id)}
                              isOwner={true}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'public-profile' && viewingProfile && (
          <div className="max-w-4xl mx-auto space-y-8">
            <button 
              onClick={() => setView('search')}
              className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 font-bold transition-all"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Kthehu te Kërkimi
            </button>
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div 
                className="h-48 bg-indigo-600 bg-cover bg-center" 
                style={{ backgroundImage: viewingProfile.coverURL ? `url(${viewingProfile.coverURL})` : 'none' }}
              />
              <div className="px-8 pb-8">
                <div className="relative -mt-16 mb-6">
                  <img 
                    src={viewingProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${viewingProfile.uid}`} 
                    className="w-32 h-32 rounded-3xl border-4 border-white shadow-xl object-cover"
                    alt="Profile"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="space-y-8">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-3xl font-bold text-slate-900">{viewingProfile.displayName}</h2>
                        {viewingProfile.isPro && (
                          <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200 flex items-center gap-1">
                            <Zap className="w-3 h-3 fill-amber-500" />
                            PRO
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500">Ofrues Shërbimesh</p>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      <CheckCircle className="w-4 h-4" />
                      I Verifikuar
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Emri Real</p>
                      <p className="font-bold text-slate-900">{viewingProfile.realName || 'I paverifikuar'}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Mosha</p>
                      <p className="font-bold text-slate-900">{viewingProfile.age ? `${viewingProfile.age} vjeç` : 'I paverifikuar'}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Vendlindja</p>
                      <p className="font-bold text-slate-900">{viewingProfile.origin || 'I paverifikuar'}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Adresa</p>
                      <p className="font-bold text-slate-900 truncate">{viewingProfile.address || 'I paverifikuar'}</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-slate-900">Shërbimet e Ofruara</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {services.filter(s => s.providerId === viewingProfile.uid).map(service => (
                        <ServiceCard 
                          key={service.id}
                          service={service}
                          userLocation={userLocation}
                          onView={() => setSelectedService(service)}
                          onHire={() => setSelectedService(service)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'create-service' && profile?.role === 'provider' && (
          <CreateServiceForm 
            onCancel={() => setView('profile')} 
            onSuccess={() => setView('home')} 
            userLocation={userLocation}
            profile={profile}
          />
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {selectedService && !isModalOpen && (
          <ServiceDetail 
            service={selectedService} 
            userLocation={userLocation}
            onClose={() => setSelectedService(null)}
            onHire={() => setIsModalOpen(true)}
            onChat={() => {
              startChat(selectedService.providerId);
              setSelectedService(null);
            }}
            onViewProfile={async (providerId) => {
              try {
                const providerDoc = await getDoc(doc(db, 'users', providerId));
                if (providerDoc.exists()) {
                  setViewingProfile(providerDoc.data() as UserProfile);
                  setSelectedService(null);
                  setView('public-profile');
                }
              } catch (error) {
                console.error("Error fetching provider profile:", error);
              }
            }}
          />
        )}

        {isModalOpen && selectedService && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-slate-900">Rezervo Shërbimin</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <p className="text-sm text-indigo-900 font-medium">{selectedService.title}</p>
                  <p className="text-xs text-indigo-600 font-bold mt-1">${selectedService.pricePerHour}/orë</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Sa orë ju nevojiten?</label>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setBookingHours(Math.max(1, bookingHours - 1))}
                      className="w-12 h-12 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all font-bold text-xl"
                    >
                      -
                    </button>
                    <span className="text-xl font-bold w-8 text-center">{bookingHours}</span>
                    <button 
                      onClick={() => setBookingHours(bookingHours + 1)}
                      className="w-12 h-12 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all font-bold text-xl"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Tarifa e shërbimit (10%)</span>
                    <span className="text-slate-900 font-bold">${(selectedService.pricePerHour * bookingHours * 0.1).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-slate-500 font-medium">Totali i vlerësuar</span>
                    <span className="text-2xl font-black text-indigo-600">${(selectedService.pricePerHour * bookingHours * 1.1).toFixed(2)}</span>
                  </div>
                  <button 
                    onClick={() => handleBooking(selectedService.id, bookingHours)}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    Konfirmo Rezervimin
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {activeChat && (
          <ChatWindow 
            chat={activeChat} 
            messages={messages} 
            currentUserId={user?.uid || ''} 
            onClose={() => setActiveChat(null)}
            onSend={sendMessage}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ServiceCard({ service, userLocation, onHire, onView, onEdit, onDelete, isOwner }: { service: ServiceListing, userLocation: Location | null, onHire: () => void, onView: () => void, onEdit?: () => void, onDelete?: () => void, isOwner?: boolean }) {
  const distance = userLocation ? calculateDistance(userLocation.lat, userLocation.lng, service.location.lat, service.location.lng) : null;

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-white rounded-3xl border border-slate-200 overflow-hidden group shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all"
    >
      <div 
        className="relative h-48 overflow-hidden cursor-pointer"
        onClick={onView}
      >
        <img 
          src={service.images?.[0] || `https://picsum.photos/seed/${service.id}/600/400`} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          alt={service.title}
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 left-4 flex gap-2">
          <span className="bg-white/90 backdrop-blur-md text-indigo-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm">
            {categoryLabels[service.category as keyof typeof categoryLabels]}
          </span>
          {isOwner && (
            <div className="flex gap-1">
              {onEdit && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="bg-white/90 backdrop-blur-md text-slate-600 p-1.5 rounded-full hover:text-indigo-600 transition-colors shadow-sm"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
              {onDelete && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="bg-white/90 backdrop-blur-md text-red-500 p-1.5 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
        {distance !== null && (
          <div className="absolute bottom-4 right-4">
            <span className="bg-slate-900/80 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1">
              <Navigation className="w-3 h-3" />
              {distance.toFixed(1)} km larg
            </span>
          </div>
        )}
      </div>
      <div className="p-6 space-y-4">
        <div 
          className="flex justify-between items-start cursor-pointer hover:text-indigo-600 transition-colors"
          onClick={onView}
        >
          <h3 className="font-bold text-slate-900 line-clamp-1 group-hover:text-indigo-600">{service.title}</h3>
          <div className="flex items-center gap-1 text-amber-500">
            <Star className="w-4 h-4 fill-current" />
            <span className="text-xs font-bold">{service.rating || 'I ri'}</span>
          </div>
        </div>
        <p className="text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">{service.description}</p>
        
        <div className="flex items-center gap-2 text-slate-400">
          <MapPin className="w-4 h-4" />
          <span className="text-xs truncate">{service.location.address}</span>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Tarifa</p>
            <p className="text-lg font-extrabold text-indigo-600">${service.pricePerHour}<span className="text-xs text-slate-400 font-normal">/orë</span></p>
          </div>
          <button 
            onClick={onHire}
            className="bg-slate-900 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-indigo-600 transition-all"
          >
            Punëso
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ServiceDetail({ service, onClose, onHire, onChat, userLocation, onViewProfile }: { service: ServiceListing, onClose: () => void, onHire: () => void, onChat: () => void, userLocation: Location | null, onViewProfile: (providerId: string) => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'reviews'), where('serviceId', '==', service.id), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review)));
    });
    return () => unsubscribe();
  }, [service.id]);

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setSubmitting(true);

    const review: Omit<Review, 'id'> = {
      serviceId: service.id,
      clientId: auth.currentUser.uid,
      clientName: auth.currentUser.displayName || 'Klient',
      rating: newReview.rating,
      comment: newReview.comment,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'reviews'), review);
      // Update service rating (simplified)
      const newCount = service.reviewCount + 1;
      const newRating = ((service.rating * service.reviewCount) + newReview.rating) / newCount;
      await updateDoc(doc(db, 'services', service.id), {
        rating: Number(newRating.toFixed(1)),
        reviewCount: newCount
      });
      setNewReview({ rating: 5, comment: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reviews');
    } finally {
      setSubmitting(false);
    }
  };

  const availabilityLabels: Record<string, string> = {
    'Full-time': 'Kohë e plotë',
    'Part-time': 'Kohë e pjesshme',
    'Weekend': 'Vetëm fundjavë'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="relative h-64 sm:h-80 bg-slate-100">
          <div className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
            {(service.images && service.images.length > 0 ? service.images : [`https://picsum.photos/seed/${service.id}/1200/800`]).map((img, idx) => (
              <img key={idx} src={img} className="w-full h-full object-cover snap-center flex-shrink-0" alt="Work" referrerPolicy="no-referrer" />
            ))}
          </div>
          <div className="absolute top-6 left-6 flex gap-2">
            {service.isProviderPro && (
              <span className="bg-amber-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1">
                <Zap className="w-3 h-3 fill-white" />
                PRO LISTING
              </span>
            )}
          </div>
          <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/40 transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 sm:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    {categoryLabels[service.category as keyof typeof categoryLabels]}
                  </span>
                  {service.availability && (
                    <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {availabilityLabels[service.availability] || service.availability}
                    </span>
                  )}
                </div>
                <h2 className="text-4xl font-black text-slate-900 leading-tight">{service.title}</h2>
                <div className="flex items-center gap-4 mt-4 text-slate-500">
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star className="w-5 h-5 fill-current" />
                    <span className="text-lg font-bold">{service.rating}</span>
                    <span className="text-sm text-slate-400">({service.reviewCount} vlerësime)</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
                    <MapPin className="w-4 h-4" />
                    {service.location.address}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-bold text-slate-900">Rreth Shërbimit</h3>
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{service.description}</p>
              </div>

              {service.experienceYears && (
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <h4 className="font-bold text-slate-900 mb-1">Përvoja</h4>
                  <p className="text-sm text-slate-500">{service.experienceYears} vite përvojë në këtë fushë.</p>
                </div>
              )}

              <div className="space-y-6">
                <h3 className="text-xl font-bold text-slate-900">Komentet dhe Vlerësimet</h3>
                
                {auth.currentUser && (
                  <form onSubmit={handleAddReview} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                    <div className="flex items-center gap-4">
                      <label className="text-sm font-bold text-slate-700">Vlerësimi:</label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <button 
                            key={s} 
                            type="button"
                            onClick={() => setNewReview({ ...newReview, rating: s })}
                            className={cn("p-1 transition-all", newReview.rating >= s ? "text-amber-500" : "text-slate-300")}
                          >
                            <Star className="w-6 h-6 fill-current" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea 
                      required
                      rows={3}
                      placeholder="Lini një koment ose bëni një pyetje për punën e ofruesit..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-white"
                      value={newReview.comment}
                      onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                    />
                    <button 
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                    >
                      {submitting ? 'Duke u dërguar...' : 'Dërgo Komentin'}
                    </button>
                  </form>
                )}

                <div className="space-y-4">
                  {reviews.length > 0 ? reviews.map(review => (
                    <div key={review.id} className="p-6 rounded-3xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">{review.clientName}</span>
                        <div className="flex text-amber-500">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={cn("w-3 h-3 fill-current", i < review.rating ? "text-amber-500" : "text-slate-200")} />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 italic">"{review.comment}"</p>
                      <p className="text-[10px] text-slate-400">{format(new Date(review.createdAt), 'PP')}</p>
                    </div>
                  )) : (
                    <p className="text-center py-8 text-slate-400 text-sm italic">Nuk ka ende komente për këtë shërbim.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl shadow-indigo-200">
                <p className="text-indigo-100 text-sm font-bold uppercase tracking-wider mb-2">Tarifa Orëtare</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-5xl font-black">${service.pricePerHour}</span>
                  <span className="text-indigo-200">/orë</span>
                </div>
                <div className="space-y-3">
                  <button 
                    onClick={onHire}
                    className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black hover:bg-indigo-50 transition-all shadow-lg"
                  >
                    Punëso Tani
                  </button>
                  <button 
                    onClick={onChat}
                    className="w-full py-3 bg-indigo-500 text-white rounded-2xl font-bold hover:bg-indigo-400 transition-all flex items-center justify-center gap-2 border border-indigo-400"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Bisedo me Ofruesin
                  </button>
                </div>
                <p className="mt-4 text-[10px] text-indigo-200 text-center italic">
                  *Mbrojtja e platformës vlen vetëm për rezervimet e bëra brenda aplikacionit.
                </p>
              </div>

              <div className="p-6 rounded-3xl border border-slate-100 space-y-4">
                <h4 className="font-bold text-slate-900">Informacion i Ofruesit</h4>
                <button 
                  onClick={() => onViewProfile(service.providerId)}
                  className="flex items-center gap-3 w-full text-left hover:bg-slate-50 p-2 rounded-2xl transition-all"
                >
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden">
                    <img 
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${service.providerId}`} 
                      className="w-full h-full object-cover"
                      alt="Provider"
                    />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{service.providerName}</p>
                    <p className="text-xs text-slate-500">Shiko Profilin e Plotë</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function BookingCard({ booking, isProvider, onUpdateStatus }: { booking: Booking, isProvider: boolean, onUpdateStatus: (id: string, status: BookingStatus) => void }) {
  const statusColors = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700"
  };

  const statusLabels = {
    pending: "Në pritje",
    confirmed: "I konfirmuar",
    completed: "I përfunduar",
    cancelled: "I anuluar"
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between shadow-sm">
      <div className="flex gap-4 items-center">
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <Calendar className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", statusColors[booking.status])}>
              {statusLabels[booking.status]}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase">ID: {booking.id.slice(0, 8)}</span>
          </div>
          <h4 className="font-bold text-slate-900">{isProvider ? `Klient: ${booking.clientName}` : `Ofrues: ${booking.providerId.slice(0, 8)}`}</h4>
          <div className="flex flex-wrap items-center gap-4 mt-1 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {booking.hours} orë</span>
            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> Tarifa: ${booking.serviceFee.toFixed(2)}</span>
            <span className="flex items-center gap-1 font-bold text-indigo-600"><DollarSign className="w-3 h-3" /> Totali: ${booking.totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 w-full md:w-auto">
        <p className="text-xs font-bold text-slate-900">{format(new Date(booking.scheduledAt), 'PPP')}</p>
        <div className="flex gap-2 w-full md:w-auto">
          {booking.status === 'pending' && isProvider && (
            <button 
              onClick={() => onUpdateStatus(booking.id, 'confirmed')}
              className="flex-1 md:flex-none px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all"
            >
              Konfirmo
            </button>
          )}
          {booking.status === 'confirmed' && isProvider && (
            <button 
              onClick={() => onUpdateStatus(booking.id, 'completed')}
              className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all"
            >
              Shëno si të përfunduar
            </button>
          )}
          {['pending', 'confirmed'].includes(booking.status) && (
            <button 
              onClick={() => onUpdateStatus(booking.id, 'cancelled')}
              className="flex-1 md:flex-none px-4 py-2 bg-white text-red-500 border border-red-100 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
            >
              Anulo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateServiceForm({ onCancel, onSuccess, userLocation, initialData, profile }: { onCancel: () => void, onSuccess: () => void, userLocation: Location | null, initialData?: ServiceListing | null, profile: UserProfile }) {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    category: initialData?.category || 'other' as ServiceCategory,
    pricePerHour: initialData?.pricePerHour || 20,
    address: initialData?.location.address || userLocation?.address || '',
    experienceYears: initialData?.experienceYears || 1,
    availability: initialData?.availability || 'Full-time',
    images: initialData?.images || []
  });
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialData && userLocation && !formData.address) {
      setFormData(prev => ({ ...prev, address: userLocation.address }));
    }
  }, [userLocation, initialData]);

  const addImage = () => {
    const limit = profile.isPro ? 5 : 2;
    if (formData.images.length >= limit) {
      alert(`Si anëtar ${profile.isPro ? 'PRO' : 'i thjeshtë'}, mund të shtoni deri në ${limit} foto.`);
      return;
    }
    if (imageUrl && !formData.images.includes(imageUrl)) {
      setFormData({ ...formData, images: [...formData.images, imageUrl] });
      setImageUrl('');
    }
  };

  const removeImage = (url: string) => {
    setFormData({ ...formData, images: formData.images.filter(img => img !== url) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);

    const serviceData: Omit<ServiceListing, 'id'> = {
      providerId: auth.currentUser.uid,
      providerName: auth.currentUser.displayName || 'Ofrues',
      category: formData.category,
      title: formData.title,
      description: formData.description,
      pricePerHour: formData.pricePerHour,
      location: {
        lat: initialData?.location.lat || userLocation?.lat || 0,
        lng: initialData?.location.lng || userLocation?.lng || 0,
        address: formData.address
      },
      rating: initialData?.rating || 0,
      reviewCount: initialData?.reviewCount || 0,
      images: formData.images,
      experienceYears: formData.experienceYears,
      availability: formData.availability,
      isProviderPro: profile.isPro || false,
      createdAt: initialData?.createdAt || new Date().toISOString()
    };

    try {
      if (initialData) {
        await updateDoc(doc(db, 'services', initialData.id), serviceData);
      } else {
        await addDoc(collection(db, 'services'), serviceData);
      }
      onSuccess();
    } catch (error) {
      handleFirestoreError(error, initialData ? OperationType.UPDATE : OperationType.CREATE, 'services');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">{initialData ? 'Përditëso Listimin' : 'Listoni Shërbimin Tuaj'}</h2>
        <p className="text-slate-500">{initialData ? 'Ndryshoni detajet e shërbimit tuaj' : 'Ndani aftësitë tuaja me qytetin'}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Titulli i Shërbimit</label>
            <input 
              required
              type="text" 
              placeholder="p.sh. Mirëmbajtje Profesionale e Kopshtit"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Kategoria</label>
            <select 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none capitalize"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as ServiceCategory })}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{categoryLabels[cat as keyof typeof categoryLabels]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Përvoja (Vite)</label>
            <input 
              type="number" 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.experienceYears}
              onChange={(e) => setFormData({ ...formData, experienceYears: parseInt(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Disponueshmëria</label>
            <select 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.availability}
              onChange={(e) => setFormData({ ...formData, availability: e.target.value })}
            >
              <option value="Full-time">Kohë e plotë</option>
              <option value="Part-time">Kohë e pjesshme</option>
              <option value="Weekend">Vetëm fundjavë</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Përshkrimi</label>
          <textarea 
            required
            rows={4}
            placeholder="Përshkruani çfarë ofroni, përvojën tuaj dhe çdo pajisje që sillni..."
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="space-y-4">
          <label className="text-sm font-bold text-slate-700">Fotografitë e Punës (URL)</label>
          <div className="flex gap-2">
            <input 
              type="url" 
              placeholder="https://shembull.com/imazhi.jpg"
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <button 
              type="button"
              onClick={addImage}
              className="bg-slate-900 text-white px-6 rounded-xl font-bold hover:bg-indigo-600 transition-all"
            >
              Shto
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {formData.images.map((img, idx) => (
              <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 group">
                <img src={img} className="w-full h-full object-cover" alt="Work" referrerPolicy="no-referrer" />
                <button 
                  type="button"
                  onClick={() => removeImage(img)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Tarifa Orëtare ($)</label>
            <input 
              required
              type="number" 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.pricePerHour}
              onChange={(e) => setFormData({ ...formData, pricePerHour: parseInt(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Zona e Shërbimit / Adresa</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button 
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
          >
            Anulo
          </button>
          <button 
            type="submit"
            disabled={loading}
            className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            {loading ? 'Duke u krijuar...' : 'Publiko Listimin'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChatWindow({ chat, messages, currentUserId, onClose, onSend }: { chat: ChatRoom, messages: Message[], currentUserId: string, onClose: () => void, onSend: (text: string) => void }) {
  const [inputText, setInputText] = useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-full max-w-sm">
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[500px]"
      >
        <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="font-black text-sm">Biseda</p>
              <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">Live Chat</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.senderId === currentUserId ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] p-4 rounded-2xl text-sm font-medium shadow-sm",
                msg.senderId === currentUserId 
                  ? "bg-indigo-600 text-white rounded-tr-none" 
                  : "bg-white text-slate-700 border border-slate-200 rounded-tl-none"
              )}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-white border-t border-slate-100">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              onSend(inputText);
              setInputText('');
            }}
            className="flex gap-2"
          >
            <input 
              type="text"
              placeholder="Shkruani mesazhin..."
              className="flex-1 px-4 py-3 rounded-xl bg-slate-100 border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
              <ChevronRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
