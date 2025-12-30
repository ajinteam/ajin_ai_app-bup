import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Item, Transaction } from './types';
import AddItemModal from './components/AddItemModal';
import ItemDetailModal from './components/ItemDetailModal';
import { PlusIcon, BoxIcon, SearchIcon, TrashIcon, DownloadIcon, CloudIcon, ServerIcon } from './components/icons';

const STORAGE_KEY = 'inventory_system_data_v2';
const ADMIN_PASSWORD = '0000';
const PRODUCT_ONLY_PASSWORD = '1111';
const DB_KEY = 'inventory_master_data';

// Upstash 설정 (환경변수 사용)
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const calculateStock = (item: Item): number => {
  return item.transactions.reduce((acc, t) => {
    return t.type === 'purchase' ? acc + t.quantity : acc - t.quantity;
  }, 0);
};

const App: React.FC = () => {
  const [authRole, setAuthRole] = useState<'admin' | 'product_only' | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'part' | 'product'>('part');
  
  const [items, setItems] = useState<Item[]>([]);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{id: string, type: 'inventory'} | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upstash 클라우드에서 데이터 가져오기
  const fetchFromServer = async () => {
    if (!KV_URL || !KV_TOKEN) {
      console.warn('KV 설정이 없습니다. 로컬 데이터를 사용합니다.');
      const savedItems = localStorage.getItem(STORAGE_KEY);
      if (savedItems) setItems(JSON.parse(savedItems));
      return;
    }

    setSyncStatus('loading');
    try {
      const response = await fetch(`${KV_URL}/get/${DB_KEY}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      const data = await response.json();
      if (data.result) {
        const parsed = JSON.parse(data.result);
        setItems(parsed.items || []);
        setSyncStatus('success');
      } else {
        const savedItems = localStorage.getItem(STORAGE_KEY);
        if (savedItems) setItems(JSON.parse(savedItems));
        setSyncStatus('idle');
      }
    } catch (err) {
      console.warn('DB 연결 실패. 로컬 데이터를 사용합니다.');
      const savedItems = localStorage.getItem(STORAGE_KEY);
      if (savedItems) setItems(JSON.parse(savedItems));
      setSyncStatus('error');
    }
  };

  // Upstash 클라우드에 데이터 저장하기
  const saveToServer = async (data: Item[]) => {
    if (!KV_URL || !KV_TOKEN) return;
    
    setSyncStatus('loading');
    try {
      const payload = JSON.stringify({ items: data, updatedAt: new Date().toISOString() });
      const response = await fetch(`${KV_URL}/set/${DB_KEY}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        body: payload, // REST API set 명령어는 body에 값을 직접 넣음
      });
      if (response.ok) setSyncStatus('success');
      else throw new Error('Cloud Save Failed');
    } catch (err) {
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    fetchFromServer();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (items.length > 0) {
      const timer = setTimeout(() => saveToServer(items), 2000);
      return () => clearTimeout(timer);
    }
  }, [items]);

  const stats = useMemo(() => {
    return {
      partCount: items.filter(i => i.type === 'part').length,
      productCount: items.filter(i => i.type === 'product').length,
    };
  }, [items]);

  const allUsedSerials = useMemo(() => {
    const serials: string[] = [];
    items.forEach(item => {
      item.transactions.forEach(t => {
        if (t.serialNumber) serials.push(t.serialNumber.toUpperCase());
      });
    });
    return Array.from(new Set(serials));
  }, [items]);

  const handleLocalExport = async () => {
    const dataObj = { items, version: '2.0', exportDate: new Date().toISOString() };
    const jsonStr = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `재고관리_백업_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLocalImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.items && Array.isArray(json.items)) {
          if (confirm('데이터를 복구하시겠습니까? 현재 데이터가 덮어씌워집니다.')) {
            setItems(json.items);
            alert('복구가 완료되었습니다.');
          }
        }
      } catch (err) { alert('파일 오류'); }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword === ADMIN_PASSWORD) setAuthRole('admin');
    else if (loginPassword === PRODUCT_ONLY_PASSWORD) setAuthRole('product_only');
    else alert('비밀번호가 틀렸습니다.');
    setLoginPassword('');
  };

  const handleLogout = () => { setAuthRole(null); setSearchTerm(''); };

  const handleAddItem = (itemData: Omit<Item, 'id' | 'transactions'>, initialQuantity: number) => {
    const newItem: Item = { ...itemData, id: generateId('item'), transactions: [] };
    if (initialQuantity > 0) {
      newItem.transactions.push({
        id: generateId('t'), type: 'purchase', quantity: initialQuantity,
        date: new Date().toISOString(), remarks: '초기 수량 등록',
      });
    }
    setItems(prev => [newItem, ...prev]);
  };

  const handleDeleteItemConfirm = () => {
    const correctPassword = authRole === 'admin' ? ADMIN_PASSWORD : PRODUCT_ONLY_PASSWORD;
    if (deletePassword !== correctPassword) {
      alert('비밀번호가 틀렸습니다.');
      return;
    }
    if (itemToDelete) {
      setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
      setItemToDelete(null);
      setDeletePassword('');
    }
  };

  const handleUpdateItem = (itemId: string, updatedData: Partial<Item>) => {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, ...updatedData } : item));
  };

  const handleAddTransaction = (itemId: string, transaction: Omit<Transaction, 'id'>) => {
    const newTransaction: Transaction = { ...transaction, id: generateId('t') };
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, transactions: [...item.transactions, newTransaction] } : item));
  };

  const handleUpdateTransaction = (itemId: string, transactionId: string, updatedData: Partial<Transaction>) => {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, transactions: item.transactions.map(t => t.id === transactionId ? { ...t, ...updatedData } : t) } : item));
  };

  const handleDeleteTransaction = (itemId: string, transactionId: string) => {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, transactions: item.transactions.filter(t => t.id !== transactionId) } : item));
  };

  const selectedItem = useMemo(() => items.find(i => i.id === selectedItemId), [items, selectedItemId]);

  const filteredInventory = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return items.filter(item => {
        const matchesTab = (activeTab === 'part' && item.type === 'part') || (activeTab === 'product' && item.type === 'product');
        if (!matchesTab) return false;
        return item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term);
    });
  }, [items, searchTerm, activeTab]);

  const exportToExcel = () => {
    let csvContent = "\ufeff코드,품명,도번,적용,현재재고\r\n";
    filteredInventory.forEach(item => {
      csvContent += `"${item.code}","${item.name}","${item.drawingNumber || ''}","${item.application || ''}",${calculateStock(item)}\r\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `재고현황_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (!authRole) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-10 border border-slate-100">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg mb-4">
              <BoxIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase text-center">재고 관리 시스템</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <input 
              type="password" autoFocus value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="PASSWORD"
              className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none text-center text-3xl font-black tracking-[0.4em] transition-all"
            />
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 transition-all text-sm uppercase tracking-widest">로그인</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="container mx-auto px-6">
            <div className="flex justify-between items-center py-5">
                <div className="flex items-center space-x-4">
                    <BoxIcon className="h-8 w-8 text-indigo-600" />
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">Inventory System</h1>
                </div>
                
                <div className="flex items-center space-x-4">
                    <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all ${syncStatus === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className={`w-2 h-2 rounded-full ${syncStatus === 'success' ? 'bg-emerald-500' : syncStatus === 'loading' ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`}></div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${syncStatus === 'success' ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {syncStatus === 'success' ? 'Synced Cloud' : syncStatus === 'loading' ? 'Syncing...' : 'Local Mode'}
                      </span>
                    </div>
                    <button onClick={handleLocalExport} className="p-2 text-slate-400 hover:text-slate-600 transition-all" title="로컬 백업 내보내기">
                        <DownloadIcon />
                    </button>
                    <label className="p-2 text-slate-400 hover:text-slate-600 transition-all cursor-pointer" title="로컬 백업 가져오기">
                        <CloudIcon />
                        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleLocalImport} />
                    </label>
                    <button onClick={handleLogout} className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors font-black text-[10px] uppercase">Logout</button>
                </div>
            </div>
            
            <div className="flex space-x-8 -mb-px">
                {authRole === 'admin' && (
                  <button onClick={() => setActiveTab('part')} className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'part' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    부품 관리 ({stats.partCount})
                  </button>
                )}
                <button onClick={() => setActiveTab('product')} className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'product' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  제품 관리 ({stats.productCount})
                </button>
            </div>
        </div>
      </header>

      <main className="container mx-auto p-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
          <div className="relative flex-grow max-w-2xl">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4"><SearchIcon className="text-slate-400 w-6 h-6" /></span>
              <input
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                  placeholder="품명 또는 코드로 검색..."
                  className="w-full pl-14 pr-6 py-4 border-2 border-slate-100 rounded-[1.25rem] focus:outline-none focus:border-indigo-400 bg-white shadow-sm font-bold text-lg transition-all"
              />
          </div>
          <div className="flex gap-3">
            <button onClick={exportToExcel} className="flex items-center gap-2 px-6 py-4 bg-emerald-600 text-white font-black rounded-xl shadow-lg hover:bg-emerald-700 transition-all text-xs uppercase tracking-widest">
                <ServerIcon className="w-5 h-5" />
                <span>엑셀 파일 저장</span>
            </button>
            <button onClick={() => setShowAddItemModal(true)} className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 transition-all text-xs uppercase tracking-widest">
                <PlusIcon className="w-5 h-5" />
                <span>신규 등록</span>
            </button>
          </div>
        </div>

        <div className="bg-white shadow-xl border border-slate-100 rounded-[2rem] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[11px] text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-black tracking-[0.2em]">
                <tr>
                  <th className="px-8 py-5">코드</th>
                  <th className="px-8 py-5">품명 / 제품명</th>
                  {activeTab === 'part' && <th className="px-8 py-5">도번 / 규격</th>}
                  <th className="px-8 py-5 text-right">현재 재고</th>
                  <th className="px-8 py-5 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredInventory.map(item => {
                  const stock = calculateStock(item);
                  return (
                    <tr key={item.id} className="hover:bg-indigo-50/20 transition-colors group">
                      <td className="px-8 py-5 font-mono text-indigo-600 font-black text-lg">{item.code}</td>
                      <td className="px-8 py-5 font-black text-slate-800 text-lg">{item.name}</td>
                      {activeTab === 'part' && (
                        <td className="px-8 py-5">
                          <p className="text-slate-500 font-bold text-sm uppercase">{item.drawingNumber || '-'}</p>
                          <p className="text-slate-400 text-xs">{item.spec || '-'}</p>
                        </td>
                      )}
                      <td className="px-8 py-5 text-right">
                          <span className={`text-3xl font-black ${stock > 0 ? 'text-slate-900' : 'text-rose-500'}`}>
                              {stock.toLocaleString()}
                          </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex justify-center gap-3">
                          <button onClick={() => setSelectedItemId(item.id)} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[11px] uppercase hover:bg-indigo-600 hover:text-white transition-all shadow-sm">상세내역</button>
                          <button onClick={() => setItemToDelete({id: item.id, type: 'inventory'})} className="p-2 text-slate-300 hover:text-rose-600 transition-all"><TrashIcon className="w-6 h-6" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] p-10 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
                <h4 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">품목 삭제</h4>
                <p className="text-sm text-slate-400 mb-6 font-bold uppercase tracking-widest">관리자 비밀번호를 입력하세요</p>
                <input type="password" autoFocus value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleDeleteItemConfirm()} placeholder="PASSWORD" className="w-full px-5 py-4 border-2 border-slate-100 rounded-xl focus:border-rose-500 outline-none mb-6 text-center text-3xl font-black tracking-widest" />
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setItemToDelete(null)} className="py-3.5 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-xs tracking-widest">취소</button>
                    <button onClick={handleDeleteItemConfirm} className="py-3.5 bg-rose-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-rose-100">삭제 확인</button>
                </div>
            </div>
        </div>
      )}

      {showAddItemModal && (
        <AddItemModal onAddItem={handleAddItem} onClose={() => setShowAddItemModal(false)} existingCodes={items.map(i => i.code)} defaultType={activeTab === 'product' ? 'product' : 'part'} />
      )}
      {selectedItemId && selectedItem && (
        <ItemDetailModal 
          item={selectedItem} 
          authRole={authRole as any} 
          allUsedSerials={allUsedSerials} 
          existingCodes={items.map(i => i.code)}
          onAddTransaction={handleAddTransaction} 
          onUpdateTransaction={handleUpdateTransaction} 
          onDeleteTransaction={handleDeleteTransaction} 
          onUpdateItem={handleUpdateItem} 
          onClose={() => setSelectedItemId(null)} 
        />
      )}
    </div>
  );
};

export default App;