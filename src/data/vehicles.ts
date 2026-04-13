export interface Vehicle {
  id: number;
  title: string;
  category: "Oldtimer" | "Gebrauchtwagen";
  brand: string;
  bodyType: string;
  year: string;
  mileage: number;
  image: string;
}

export const vehicles: Vehicle[] = [
  {
    id: 1,
    title: '1000 (Auto Union) SP, europäische Auslieferung',
    category: 'Oldtimer',
    brand: 'Auto Union',
    bodyType: 'Cabrio/Roadster',
    year: '1960-07',
    mileage: 80854,
    image: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&h=450&fit=crop'
  },
  {
    id: 2,
    title: 'Austin-Healey 3000 MK III BJ8, matching numbers',
    category: 'Oldtimer',
    brand: 'Austin-Healey',
    bodyType: 'Cabrio/Roadster',
    year: '1966-03',
    mileage: 45230,
    image: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=450&fit=crop'
  },
  {
    id: 3,
    title: 'Mercedes-Benz 280 SL Pagode, restauriert',
    category: 'Oldtimer',
    brand: 'Mercedes-Benz',
    bodyType: 'Cabrio/Roadster',
    year: '1969-11',
    mileage: 112400,
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&h=450&fit=crop'
  },
  {
    id: 4,
    title: 'Porsche 911 S 2.0 Targa, Originalzustand',
    category: 'Oldtimer',
    brand: 'Porsche',
    bodyType: 'Targa',
    year: '1967-05',
    mileage: 98750,
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=450&fit=crop'
  },
  {
    id: 5,
    title: 'BMW 2002 tii, vollrestauriert',
    category: 'Oldtimer',
    brand: 'BMW',
    bodyType: 'Limousine',
    year: '1972-09',
    mileage: 67000,
    image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=450&fit=crop'
  },
  {
    id: 6,
    title: 'Jaguar E-Type Series I Coupé, restauriert',
    category: 'Oldtimer',
    brand: 'Jaguar',
    bodyType: 'Coupé',
    year: '1963-08',
    mileage: 54320,
    image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=450&fit=crop'
  },
  {
    id: 7,
    title: 'Fiat 500 L, liebevoll restauriert',
    category: 'Oldtimer',
    brand: 'Fiat',
    bodyType: 'Kleinwagen',
    year: '1970-04',
    mileage: 42100,
    image: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=800&h=450&fit=crop'
  },
  {
    id: 8,
    title: 'VW Käfer 1303 LS Cabriolet',
    category: 'Oldtimer',
    brand: 'VW',
    bodyType: 'Cabrio/Roadster',
    year: '1973-06',
    mileage: 89200,
    image: 'https://images.unsplash.com/photo-1489824904134-891ab64532f1?w=800&h=450&fit=crop'
  },
  {
    id: 9,
    title: 'BMW 520d Touring, gepflegt',
    category: 'Gebrauchtwagen',
    brand: 'BMW',
    bodyType: 'Kombi',
    year: '2019-03',
    mileage: 78500,
    image: 'https://images.unsplash.com/photo-1556189250-72ba954cfc2b?w=800&h=450&fit=crop'
  },
  {
    id: 10,
    title: 'Mercedes-Benz C 200 Avantgarde',
    category: 'Gebrauchtwagen',
    brand: 'Mercedes-Benz',
    bodyType: 'Limousine',
    year: '2020-11',
    mileage: 45200,
    image: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=450&fit=crop'
  },
  {
    id: 11,
    title: 'Porsche Macan S, Vollausstattung',
    category: 'Gebrauchtwagen',
    brand: 'Porsche',
    bodyType: 'SUV',
    year: '2021-06',
    mileage: 32100,
    image: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&h=450&fit=crop'
  },
  {
    id: 12,
    title: 'Fiat 124 Spider Abarth, Sondermodell',
    category: 'Gebrauchtwagen',
    brand: 'Fiat',
    bodyType: 'Cabrio/Roadster',
    year: '2018-09',
    mileage: 28900,
    image: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=450&fit=crop'
  },
];
