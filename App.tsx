
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Item, Transaction } from './types';
import AddItemModal from './components/AddItemModal';
import ItemDetailModal from './components/ItemDetailModal';
import { PlusIcon, BoxIcon, SearchIcon, TrashIcon, DownloadIcon, CloudIcon, SyncIcon, ServerIcon } from './components/icons';

const STORAGE_KEY = 'inventory_system_data_v2';
const ADMIN_PASSWORD = '0000';
const PRODUCT_ONLY_PASSWORD = '1111';

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

  // --- 서버 동기화 로직 (Vercel KV / Postgres 연동용) ---
  const fetchFromServer = async () => {
    setSyncStatus('loading');
    try {
      // 실제 구현 시 /api/inventory 엔드포인트를 호출합니다.
      const response = await fetch('/api/inventory');
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.items)) {
          setItems(data.items);
          setSyncStatus('success');
          return;
        }
      }
      throw new Error('Server Fetch Failed');
    } catch (err) {
      console.warn('서버에서 데이터를 가져오지 못했습니다. 로컬 데이터를 사용합니다.');
      const savedItems = localStorage.getItem(STORAGE_KEY);
      if (savedItems) setItems(JSON.parse(savedItems));
      setSyncStatus('error');
    }
  };

  const saveToServer = async (data: Item[]) => {
    setSyncStatus('loading');
    try {
      // 실제 구현 시 /api/inventory 엔드포인트에 POST/PUT 요청을 보냅니다.
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: data, updatedAt: new Date().toISOString() }),
      });
      if (response.ok) setSyncStatus('success');
      else throw new Error('Server Save Failed');
    } catch (err) {
      setSyncStatus('error');
      console.error('서버 동기화 실패:', err);
    }
  };

  useEffect(() => {
    fetchFromServer();
  }, []);

  // 데이터 변경 시 로컬 스토리지 저장 및 서버 동기화 (디바운스 권장)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (items.length > 0) {
      const timer = setTimeout(() => saveToServer(items), 1000);
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

  // --- 로컬 파일 백업 (저장 위치 지정 지원) ---
  const handleLocalExport = async () => {
    const dataObj = { items, version: '2.0', exportDate: new Date().toISOString() };
    const jsonStr = JSON.stringify(dataObj, null, 2);

    // 최신 브라우저의 File System Access API 시도
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `재고관리_백업_${new Date().toISOString().split('T')[0]}.json`,
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
        alert('파일이 지정된 위치에 저장되었습니다.');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('File API Error:', err);
      }
    }

    // 폴백: 일반 다운로드 방식
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
          if (confirm('가져온 데이터로 현재 시스템을 복구하시겠습니까?\n(현재의 모든 데이터가 덮어씌워집니다.)')) {
            setItems(json.items);
            alert('데이터 복구가 완료되었습니다.');
          }
        } else {
          alert('올바른 백업 파일 형식이 아닙니다.');
        }
      } catch (err) {
        alert('파일을 읽는 중 오류가 발생했습니다.');
      }
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

  const handleLogout = () => {
    setAuthRole(null);
    setSearchTerm('');
  };

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
    const currentPass = authRole === 'admin' ? ADMIN_PASSWORD : PRODUCT_ONLY_PASSWORD;
    if (deletePassword !== currentPass) {
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
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, transactions: [...item.transactions, newTransaction] };
      }
      return item;
    }));
  };

  const handleUpdateTransaction = (itemId: string, transactionId: string, updatedData: Partial<Transaction>) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, transactions: item.transactions.map(t => t.id === transactionId ? { ...t, ...updatedData } : t) };
      }
      return item;
    }));
  };

  const handleDeleteTransaction = (itemId: string, transactionId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, transactions: item.transactions.filter(t => t.id !== transactionId) };
      }
      return item;
    }));
  };

  const selectedItem = useMemo(() => items.find(i => i.id === selectedItemId), [items, selectedItemId]);

  const filteredInventory = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return items.filter(item => {
        const matchesTab = (activeTab === 'part' && item.type === 'part') || (activeTab === 'product' && item.type === 'product');
        if (!matchesTab) return false;
        const basicMatch = item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term);
        if (basicMatch) return true;
        if (activeTab === 'product') return item.transactions.some(t => t.serialNumber?.toLowerCase().includes(term));
        return false;
    });
  }, [items, searchTerm, activeTab]);

  const exportToExcel = () => {
    let csvContent = "\ufeff";
    const headers = activeTab === 'part' ? ['코드', '품명', '도번', '현재재고'] : ['코드', '제품명', '현재재고'];
    csvContent += headers.join(',') + '\r\n';
    filteredInventory.forEach(item => {
      const row = activeTab === 'part' 
        ? [item.code, item.name, item.drawingNumber, calculateStock(item)]
        : [item.code, item.name, calculateStock(item)];
      csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTab === 'part' ? '부품' : '제품'}_재고_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (!authRole) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 animate-fade-in-up border border-slate-100">
          <div className="flex flex-col items-center mb-10">
            <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg mb-6">
              <BoxIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">재고 관리 시스템</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <input 
              type="password" autoFocus value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="PASSWORD"
              className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none text-center text-3xl font-black tracking-[0.5em] transition-all"
            />
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-xl hover:bg-indigo-700 transition-all">로그인</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6">
            <div className="flex justify-between items-center py-4">
                <div className="flex items-center space-x-3">
                    <BoxIcon className="h-7 w-7 text-indigo-600" />
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight uppercase">재고 관리 시스템</h1>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                    <div className={`w-2 h-2 rounded-full ${syncStatus === 'success' ? 'bg-emerald-500' : syncStatus === 'loading' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'}`}></div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        {syncStatus === 'success' ? 'Cloud Synced' : syncStatus === 'loading' ? 'Syncing...' : 'Sync Error'}
                    </span>
                  </div>
                  <button onClick={handleLogout} className="px-3 py-1 bg-slate-100 text-slate-500 rounded-md hover:bg-slate-200 transition-colors font-bold text-xs uppercase">Logout</button>
                </div>
            </div>
            <div className="flex space-x-8 -mb-px">
                {authRole === 'admin' && (
                  <button onClick={() => setActiveTab('part')} className={`pb-3 px-1 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'part' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    부품 재고관리 ({stats.partCount})
                  </button>
                )}
                <button onClick={() => setActiveTab('product')} className={`pb-3 px-1 text-sm font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'product' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  제품 재고관리 ({stats.productCount})
                </button>
            </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6">
        <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center gap-4 mb-8">
          <div className="relative flex-grow max-w-xl">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4"><SearchIcon className="text-slate-400 w-5 h-5" /></span>
              <input
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                  placeholder="품명, 코드, 일련번호 검색..."
                  className="w-full pl-11 pr-4 py-3 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-indigo-400 bg-white shadow-sm font-medium transition-all"
              />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleLocalExport} className="flex items-center gap-2 px-4 py-3 bg-slate-800 text-white font-black rounded-xl shadow-lg hover:bg-slate-900 transition-all text-xs uppercase tracking-widest">
                <DownloadIcon className="w-4 h-4" />
                <span>데이터 내보내기</span>
            </button>
            <label className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-slate-200 text-slate-600 font-black rounded-xl shadow-sm hover:bg-slate-50 transition-all text-xs cursor-pointer uppercase tracking-widest">
                <CloudIcon className="w-4 h-4" />
                <span>데이터 가져오기</span>
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleLocalImport} />
            </label>
            <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white font-black rounded-xl shadow-lg hover:bg-emerald-700 transition-all text-xs uppercase tracking-widest">
                <ServerIcon className="w-4 h-4" />
                <span>엑셀 파일 저장</span>
            </button>
            <button onClick={() => setShowAddItemModal(true)} className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-xs uppercase tracking-widest">
                <PlusIcon className="w-5 h-5" />
                <span>신규 등록</span>
            </button>
          </div>
        </div>

        <div className="bg-white shadow-xl border border-slate-100 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-black tracking-[0.15em]">
                <tr>
                  <th className="px-8 py-5">품목 코드</th>
                  <th className="px-8 py-5">품명 / 제품명</th>
                  {activeTab === 'part' && <th className="px-8 py-5">도번</th>}
                  <th className="px-8 py-5 text-right">현재 재고수량</th>
                  <th className="px-8 py-5 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredInventory.length === 0 ? (
                  <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest italic text-lg">기록된 데이터가 없습니다</td></tr>
                ) : (
                  filteredInventory.map(item => {
                    const stock = calculateStock(item);
                    return (
                      <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-8 py-5 font-mono text-indigo-600 font-black text-base">{item.code}</td>
                        <td className="px-8 py-5 font-bold text-slate-800 text-base">{item.name}</td>
                        {activeTab === 'part' && <td className="px-8 py-5 text-slate-400 font-mono text-xs uppercase">{item.drawingNumber || '-'}</td>}
                        <td className="px-8 py-5 text-right">
                            <span className={`text-xl font-black ${stock > 0 ? 'text-slate-900' : 'text-rose-500 animate-pulse'}`}>
                                {stock.toLocaleString()} <span className="text-[10px] uppercase text-slate-400 ml-1">EA</span>
                            </span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex justify-center gap-3">
                            <button onClick={() => setSelectedItemId(item.id)} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-600 hover:text-white transition-all">상세</button>
                            <button onClick={() => setItemToDelete({id: item.id, type: 'inventory'})} className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><TrashIcon className="w-5 h-5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-10 max-w-sm w-full shadow-2xl border border-slate-100 animate-fade-in-up">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-4 bg-rose-50 rounded-2xl mb-4"><TrashIcon className="w-10 h-10 text-rose-500" /></div>
                    <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">삭제 비밀번호</h4>
                    <p className="text-xs text-slate-400 font-bold mt-1 uppercase">정말로 삭제하시겠습니까?</p>
                </div>
                <input type="password" autoFocus value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleDeleteItemConfirm()} placeholder="PASSWORD" className="w-full px-4 py-4 border-2 border-slate-100 rounded-2xl focus:border-rose-500 outline-none mb-6 text-center text-2xl font-black tracking-widest" />
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setItemToDelete(null)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest">취소</button>
                    <button onClick={handleDeleteItemConfirm} className="py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-rose-100">삭제 확정</button>
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
