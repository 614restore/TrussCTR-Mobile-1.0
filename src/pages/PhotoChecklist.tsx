import React, { useState } from 'react';
import { Camera, ChevronLeft, CheckCircle2, Circle, Image as ImageIcon, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function PhotoChecklist() {
  const navigate = useNavigate();
  const [items, setItems] = useState([
    { id: 1, label: 'Front Elevation', completed: true, photo: 'https://picsum.photos/seed/front/400/300' },
    { id: 2, label: 'Rear Elevation', completed: true, photo: 'https://picsum.photos/seed/rear/400/300' },
    { id: 3, label: 'Left Elevation', completed: false, photo: null },
    { id: 4, label: 'Right Elevation', completed: false, photo: null },
    { id: 5, label: 'Roof Surface (General)', completed: false, photo: null },
    { id: 6, label: 'Flashing Details', completed: false, photo: null },
    { id: 7, label: 'Gutter Condition', completed: false, photo: null },
    { id: 8, label: 'Attic/Interior Leaks', completed: false, photo: null },
  ]);

  const toggleItem = (id: number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 active:scale-90 transition-transform">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-primary">Photo Checklist</h1>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="card p-5 bg-primary text-white flex items-center justify-between">
          <div>
            <p className="text-xs text-white/60 font-bold uppercase tracking-widest">Progress</p>
            <p className="text-2xl font-bold">{items.filter(i => i.completed).length} / {items.length}</p>
          </div>
          <div className="h-12 w-12 rounded-full border-4 border-white/10 flex items-center justify-center">
            <span className="text-xs font-bold">{Math.round((items.filter(i => i.completed).length / items.length) * 100)}%</span>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4 flex items-center justify-between active:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => toggleItem(item.id)}>
                  {item.completed ? (
                    <CheckCircle2 className="text-emerald-500" size={24} />
                  ) : (
                    <Circle className="text-slate-200" size={24} />
                  )}
                </button>
                <div>
                  <p className={`text-sm font-bold ${item.completed ? 'text-slate-400 line-through' : 'text-primary'}`}>
                    {item.label}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {item.photo ? (
                  <div className="h-10 w-10 rounded-lg overflow-hidden border border-slate-100">
                    <img src={item.photo} alt={item.label} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ) : (
                  <button className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
                    <Camera size={18} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-4 flex gap-3 z-20">
        <button className="flex-1 bg-primary text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform flex items-center justify-center gap-2">
          <ImageIcon size={18} />
          Upload All
        </button>
      </div>
    </div>
  );
}
