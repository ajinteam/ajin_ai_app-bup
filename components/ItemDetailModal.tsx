
import React, { useState, useMemo, useEffect } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon, ArrowUpIcon, ArrowDownIcon, EditIcon, CheckIcon, BoxIcon, TrashIcon, DownloadIcon } from './icons';

interface ItemDetailModalProps {
  item: Item;
  authRole: 'admin' | 'product_only';
  allUsedSerials: string[];
  existingCodes: string[];
  onAddTransaction: (itemId: string, transaction: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (itemId: string, transactionId: string, updatedData: Partial<Transaction>) => void;
  onDeleteTransaction: (itemId: string, transactionId: string) => void;
  onUpdateItem: (itemId: string, updatedData: Partial<Item>) => void;
  onClose: () => void;
}

const ADMIN_PASSWORD = '0000';
const PRODUCT_ONLY_PASSWORD = '1111';

// Helper to suggest next serial number with 5-digit padding
const suggestNextSerial = (usedSerials: string[]): string => {
  if (usedSerials.length === 0) return 'SN00001';
  
  const regex = /^([a-zA-Z]+)(\d+)$/;
  let maxNum = 0;
  let currentPrefix = 'SN';

  usedSerials.forEach(s => {
    const match = s.match(regex);
    if (match) {
      currentPrefix = match[1];
      const num = parseInt(match[2], 10);
      if (num > maxNum) maxNum = num;
    }
  });

  const nextNum = maxNum + 1;
  // Padding changed to 5 digits
  const padLength = Math.max(5, nextNum.toString().length);
  return `${currentPrefix}${nextNum.toString().padStart(padLength, '0')}`;
};

const parseSerialRange = (input: string): string[] => {
  const rangeMatch = input.match(/^(.+?)(\d+)\s*~\s*(.+?)?(\d+)$/);
  if (!rangeMatch) return [input.trim()];
  const prefix = rangeMatch[1];
  const startNumStr = rangeMatch[2];
  const endNumStr = rangeMatch[4];
  const startNum = parseInt(startNumStr, 10);
  const endNum = parseInt(endNumStr, 10);
  if (isNaN(startNum) || isNaN(endNum) || startNum > endNum) return [input.trim()];
  if (endNum - startNum >= 100) throw new Error('일련번호 범위는 한 번에 최대 100개까지 입력 가능합니다.');
  const results: string[] = [];
  const padLength = startNumStr.length;
  for (let i = startNum; i <= endNum; i++) {
    const paddedNum = i.toString().padStart(padLength, '0');
    results.push(`${prefix}${paddedNum}`);
  }
  return results;
};

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ 
  item, authRole, allUsedSerials, existingCodes, onAddTransaction, onUpdateTransaction, onDeleteTransaction, onUpdateItem, onClose 
}) => {
  const [transactionType, setTransactionType] = useState<'purchase' | 'release'>('purchase');
  const [quantity, setQuantity] = useState('');
  const [transRemarks, setTransRemarks] = useState('');
  const [transModelName, setTransModelName] = useState('');
  const [transUserId, setTransUserId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [transEditData, setTransEditData] = useState<Partial<Transaction>>({});
  const [showPasswordInput, setShowPasswordInput] = useState<{ type: 'item' | 'trans_save' | 'trans_delete'; targetId?: string; } | null>(null);
  const [password, setPassword] = useState('');
  const [editFormData, setEditFormData] = useState<Partial<Item>>({});

  // When modal opens for a product, suggest next serial number
  useEffect(() => {
    if (item.type === 'product' && !serialNumber) {
      setSerialNumber(suggestNextSerial(allUsedSerials));
    }
  }, [item, allUsedSerials]);

  useEffect(() => {
    setEditFormData({
      name: item.name,
      code: item.code,
      modelName: item.modelName,
      application: item.application,
      drawingNumber: item.drawingNumber,
      spec: item.spec || '',
      remarks: item.remarks,
      registrationDate: item.registrationDate
    });
  }, [item]);

  const currentStock = useMemo(() => {
    return item.transactions.reduce((acc, t) => t.type === 'purchase' ? acc + t.quantity : acc - t.quantity, 0);
  }, [item.transactions]);

  // Real-time Serial Duplicate Check
  const isSerialDuplicate = useMemo(() => {
    if (!serialNumber.trim() || serialNumber.includes('~')) return false;
    return allUsedSerials.includes(serialNumber.toUpperCase());
  }, [serialNumber, allUsedSerials]);

  // Real-time Code Duplicate Check (when editing item info)
  const isCodeDuplicate = useMemo(() => {
    if (!editFormData.code || editFormData.code === item.code) return false;
    return existingCodes.some(c => c.toUpperCase() === editFormData.code?.toUpperCase());
  }, [editFormData.code, existingCodes, item.code]);

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    let targetSerials: string[] = [serialNumber.toUpperCase().trim()];
    let isRange = false;
    if (item.type === 'product' && serialNumber.includes('~')) {
      try { targetSerials = parseSerialRange(serialNumber.toUpperCase()); isRange = true; } catch (err: any) { alert(err.message); return; }
    }
    const duplicates = targetSerials.filter(s => !!s && allUsedSerials.includes(s));
    if (duplicates.length > 0) {
      alert(`다음 일련번호가 이미 존재합니다:\n${duplicates.slice(0, 5).join(', ')}...`);
      return;
    }
    const count = isRange ? targetSerials.length : (parseInt(quantity, 10) || 0);
    if (count <= 0) { alert('유효한 수량을 입력하세요.'); return; }
    if (transactionType === 'release' && count > currentStock) { alert('출고 수량이 현재 재고보다 많을 수 없습니다.'); return; }
    if (isRange) {
      targetSerials.forEach(s => {
        onAddTransaction(item.id, {
          type: transactionType, quantity: 1, date: new Date().toISOString(),
          remarks: transRemarks, modelName: transModelName, userId: transUserId, serialNumber: s,
          customerName, address, phoneNumber,
        });
      });
      alert(`${targetSerials.length}건의 기록이 등록되었습니다.`);
    } else {
      onAddTransaction(item.id, {
        type: transactionType, quantity: count, date: new Date().toISOString(),
        remarks: transRemarks, modelName: transModelName, userId: transUserId, 
        serialNumber: item.type === 'product' ? serialNumber.toUpperCase() : '',
        customerName: item.type === 'product' ? customerName : '',
        address: item.type === 'product' ? address : '',
        phoneNumber: item.type === 'product' ? phoneNumber : '',
      });
    }
    setQuantity(''); setTransRemarks(''); setTransModelName(''); setTransUserId(''); 
    setSerialNumber(suggestNextSerial([...allUsedSerials, ...targetSerials])); // Re-suggest after add
    setCustomerName(''); setAddress(''); setPhoneNumber('');
  };
  
  const handleActionConfirm = () => {
    const requiredPass = authRole === 'admin' ? ADMIN_PASSWORD : PRODUCT_ONLY_PASSWORD;
    if (password !== requiredPass) { alert('비밀번호가 틀렸습니다.'); return; }
    const currentAction = showPasswordInput; setPassword(''); setShowPasswordInput(null);
    if (currentAction?.type === 'item') {
        onUpdateItem(item.id, editFormData); setIsEditing(false);
    } else if (currentAction?.type === 'trans_save' && currentAction.targetId) {
        onUpdateTransaction(item.id, currentAction.targetId, transEditData); setEditingTransactionId(null);
    } else if (currentAction?.type === 'trans_delete' && currentAction.targetId) {
        onDeleteTransaction(item.id, currentAction.targetId);
    }
  };

  const handleToggleEdit = () => {
    if (isEditing) {
        if (!editFormData.name || !editFormData.code) { alert('품명과 코드는 필수입니다.'); return; }
        if (isCodeDuplicate) { alert('이미 존재하는 코드입니다.'); return; }
        setShowPasswordInput({ type: 'item' });
    } else { setIsEditing(true); }
  };

  const handleEditTransaction = (t: Transaction) => {
    setEditingTransactionId(t.id); setTransEditData({ ...t });
  };

  const handleTransEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const upperOnly = ['code', 'name', 'serialNumber'];
    const processedValue = (name === 'quantity') ? (parseInt(value, 10) || 0) : (upperOnly.includes(name) ? value.toUpperCase() : value);
    setTransEditData(prev => ({ ...prev, [name]: processedValue }));
  };

  const handleSaveTransEdit = (tId: string) => { setShowPasswordInput({ type: 'trans_save', targetId: tId }); };
  const handleDeleteTrans = (tId: string) => { setShowPasswordInput({ type: 'trans_delete', targetId: tId }); };

  const exportHistoryToExcel = () => {
    if (item.transactions.length === 0) { alert('내보낼 내역이 없습니다.'); return; }
    let csvContent = "\ufeff";
    const baseHeaders = ['날짜', '시간', '구분', '수량'];
    const detailHeaders = item.type === 'part' ? ['기종', '비고'] : ['아이디', '일련번호', '고객명', '연락처', '주소', '비고'];
    csvContent += [...baseHeaders, ...detailHeaders].join(',') + '\r\n';
    [...item.transactions].reverse().forEach(t => {
      const date = new Date(t.date);
      const row = [date.toLocaleDateString(), date.toLocaleTimeString(), t.type === 'purchase' ? '입고' : '출고', t.quantity];
      if (item.type === 'part') { row.push(t.modelName || '', t.remarks || ''); }
      else { row.push(t.userId || '', t.serialNumber || '', t.customerName || '', t.phoneNumber || '', t.address || '', t.remarks || ''); }
      const escapedRow = row.map(val => `"${String(val).replace(/"/g, '""')}"`);
      csvContent += escapedRow.join(',') + '\r\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${item.name}_수불내역_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl flex flex-col h-full max-h-[95vh] overflow-hidden animate-fade-in-up">
        {showPasswordInput && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 animate-fade-in-up">
                    <h4 className="text-lg font-black text-slate-800 mb-2">권한 인증</h4>
                    <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleActionConfirm()} placeholder="비밀번호" className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:border-indigo-500 outline-none mb-4 text-center text-xl font-bold tracking-widest" />
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => { setShowPasswordInput(null); setPassword(''); }} className="py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all uppercase text-xs">취소</button>
                        <button onClick={handleActionConfirm} className="py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all uppercase text-xs">확인</button>
                    </div>
                </div>
            </div>
        )}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div><h2 className="text-xl font-black text-slate-800 tracking-tight">{item.type === 'part' ? '부품' : '제품'} 상세 정보</h2></div>
          <div className="flex gap-2">
              <button onClick={handleToggleEdit} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${isEditing ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50'}`}>
                {isEditing ? <CheckIcon className="w-4 h-4" /> : <EditIcon className="w-4 h-4" />}
                <span>{isEditing ? '저장' : '정보 수정'}</span>
              </button>
              {isEditing && <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors uppercase">취소</button>}
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors ml-2"><CloseIcon className="w-6 h-6" /></button>
          </div>
        </div>
        <div className="flex-grow overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-50/80 p-6 rounded-2xl border border-slate-100">
              {isEditing ? (
                <div className="space-y-4">
                    <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">품명</label>
                    <input name="name" value={editFormData.name || ''} onChange={(e) => setEditFormData({...editFormData, name: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border-2 border-indigo-100 bg-indigo-50/30 rounded-lg text-sm font-bold outline-none" /></div>
                    <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">코드</label>
                    <input name="code" value={editFormData.code || ''} onChange={(e) => setEditFormData({...editFormData, code: e.target.value.toUpperCase()})} className={`w-full px-3 py-2 border-2 rounded-lg text-sm font-mono font-bold outline-none ${isCodeDuplicate ? 'border-rose-400 bg-rose-50' : 'border-indigo-100 bg-indigo-50/30'}`} />
                    {isCodeDuplicate && <p className="text-[9px] text-rose-500 font-black mt-1 uppercase">중복된 코드입니다</p>}
                    </div>
                    {item.type === 'part' && (
                      <>
                        <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">도번</label>
                        <input name="drawingNumber" value={editFormData.drawingNumber || ''} onChange={(e) => setEditFormData({...editFormData, drawingNumber: e.target.value})} className="w-full px-3 py-2 border-2 border-indigo-100 bg-indigo-50/30 rounded-lg text-sm font-mono font-bold outline-none" /></div>
                        <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">규격</label>
                        <input name="spec" value={editFormData.spec || ''} onChange={(e) => setEditFormData({...editFormData, spec: e.target.value})} className="w-full px-3 py-2 border-2 border-indigo-100 bg-indigo-50/30 rounded-lg text-sm font-medium outline-none" /></div>
                      </>
                    )}
                    <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">비고</label>
                    <textarea name="remarks" value={editFormData.remarks || ''} onChange={(e) => setEditFormData({...editFormData, remarks: e.target.value})} rows={2} className="w-full px-3 py-2 border-2 border-indigo-100 bg-indigo-50/30 rounded-lg text-sm font-medium outline-none" /></div>
                </div>
              ) : (
                <>
                  <h3 className="text-2xl font-black text-slate-800 mb-4 break-all leading-tight uppercase tracking-tight">{item.name}</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-slate-200/50 pb-2"><span className="text-slate-400 font-bold uppercase text-[10px]">Code</span><span className="font-mono font-bold text-indigo-600">{item.code}</span></div>
                    {item.type === 'part' && (
                      <>
                        <div className="flex justify-between border-b border-slate-200/50 pb-2"><span className="text-slate-400 font-bold uppercase text-[10px]">Drawing No</span><span className="font-mono font-bold text-slate-500 uppercase">{item.drawingNumber || '-'}</span></div>
                        <div className="flex justify-between border-b border-slate-200/50 pb-2"><span className="text-slate-400 font-bold uppercase text-[10px]">Specification</span><span className="font-bold text-slate-500">{item.spec || '-'}</span></div>
                      </>
                    )}
                    <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase text-[10px]">Reg Date</span><span className="font-bold text-slate-500">{item.registrationDate}</span></div>
                    {item.remarks && (<div className="mt-4 p-3 bg-white rounded-xl border border-slate-100 text-slate-600 font-medium leading-relaxed italic">{item.remarks}</div>)}
                  </div>
                </>
              )}
              <div className="mt-8 pt-6 border-t border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Level</p>
                <p className="text-4xl font-black text-slate-900 leading-none">{currentStock.toLocaleString()} <span className="text-lg text-slate-400 font-bold uppercase">EA</span></p>
              </div>
            </div>
            {!isEditing && (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">신규 수불 등록</h3>
                  <form onSubmit={handleAddTransaction} className="space-y-4">
                      <div className="flex p-1 bg-slate-100 rounded-xl">
                          <button type="button" onClick={() => setTransactionType('purchase')} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${transactionType === 'purchase' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>입고</button>
                          <button type="button" onClick={() => setTransactionType('release')} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${transactionType === 'release' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>출고</button>
                      </div>
                      <div className="space-y-2">
                        {item.type === 'product' ? (
                          <>
                            <div className="grid grid-cols-1 gap-2"><div className="relative">
                                <div className="flex justify-between items-center mb-1">
                                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">일련번호 (범위입력 가능: ~)</label>
                                  <button type="button" onClick={() => setSerialNumber(suggestNextSerial(allUsedSerials))} className="text-[9px] font-black text-indigo-600 hover:underline uppercase">다음번호 추천</button>
                                </div>
                                <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value.toUpperCase())} placeholder="예: SN00001~00010" className={`w-full px-3 py-2 text-sm border-2 rounded-lg font-bold outline-none focus:ring-2 focus:ring-indigo-500 ${isSerialDuplicate ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-slate-200'}`} />
                                {isSerialDuplicate && <p className="text-[9px] text-rose-500 font-black mt-1 uppercase">시스템 전체에서 이미 사용된 번호입니다</p>}
                            </div></div>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="number" value={serialNumber.includes('~') ? '' : quantity} disabled={serialNumber.includes('~')} onChange={(e) => setQuantity(e.target.value)} placeholder={serialNumber.includes('~') ? "범위 자동계산" : "수량 *"} min="1" required={!serialNumber.includes('~')} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-bold outline-none disabled:bg-slate-50" />
                                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="이름" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-bold outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="text" value={transUserId} onChange={(e) => setTransUserId(e.target.value)} placeholder="아이디" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-bold outline-none" />
                                <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="전화번호" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-bold outline-none" />
                            </div>
                            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-bold outline-none" />
                          </>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="수량 *" min="1" required className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-bold outline-none" />
                            <input type="text" value={transModelName} onChange={(e) => setTransModelName(e.target.value)} placeholder="기종" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-bold outline-none" />
                          </div>
                        )}
                        <input type="text" value={transRemarks} onChange={(e) => setTransRemarks(e.target.value)} placeholder="사유 / 비고" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-medium outline-none" />
                      </div>
                      <button type="submit" disabled={isSerialDuplicate} className={`w-full py-3 text-white text-sm font-black rounded-xl shadow-lg transition-all active:scale-95 ${isSerialDuplicate ? 'bg-slate-300 cursor-not-allowed' : (transactionType === 'purchase' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700')} uppercase tracking-widest`}>기록 저장</button>
                  </form>
              </div>
            )}
          </div>
          <div className="lg:col-span-3 flex flex-col">
            <div className="flex justify-between items-end mb-4"><h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">입출고 히스토리</h3>
              <button onClick={exportHistoryToExcel} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[11px] font-black hover:bg-emerald-600 hover:text-white transition-all uppercase shadow-sm">
                <DownloadIcon className="w-3.5 h-3.5" /><span>내역 내보내기</span></button>
            </div>
            <div className="flex-grow border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                <div className="h-full max-h-[calc(90vh-180px)] overflow-y-auto">
                    {item.transactions.length === 0 ? (<div className="flex flex-col items-center justify-center h-full p-12 opacity-30"><BoxIcon className="w-12 h-12 mb-2" /><p className="text-xs font-bold uppercase tracking-widest">기록 없음</p></div>) : (
                        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
                            <thead className="bg-white border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 sticky top-0 z-10"><tr><th className="px-4 py-3">날짜/구분</th><th className="px-4 py-3">수량</th>{item.type === 'part' && <th className="px-4 py-3">기종</th>}{item.type === 'product' && (<><th className="px-4 py-3">아이디</th><th className="px-4 py-3">일련번호</th><th className="px-4 py-3">대상자</th><th className="px-4 py-3">주소</th></>)}<th className="px-4 py-3">비고</th><th className="px-4 py-3 text-center">작업</th></tr></thead>
                            <tbody className="divide-y divide-white">
                                {[...item.transactions].reverse().map(t => (
                                    <tr key={t.id} className={`hover:bg-white transition-all group ${editingTransactionId === t.id ? 'bg-indigo-50' : ''}`}><td className="px-4 py-3"><div className="flex items-center gap-2"><div className={`p-1 rounded ${t.type === 'purchase' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{t.type === 'purchase' ? <ArrowUpIcon className="w-3 h-3"/> : <ArrowDownIcon className="w-3 h-3"/>}</div><div><p className="font-bold text-slate-700">{new Date(t.date).toLocaleDateString()}</p><p className="text-[9px] text-slate-400">{new Date(t.date).toLocaleTimeString()}</p></div></div></td>
                                        <td className="px-4 py-3">{editingTransactionId === t.id ? (<input name="quantity" type="number" value={transEditData.quantity} onChange={handleTransEditChange} className="w-16 px-2 py-1 border rounded bg-white font-bold" />) : (<span className={`font-black text-sm ${t.type === 'purchase' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.type === 'purchase' ? '+' : '-'}{t.quantity.toLocaleString()}</span>)}</td>
                                        {item.type === 'part' && (<td className="px-4 py-3">{editingTransactionId === t.id ? (<input name="modelName" value={transEditData.modelName || ''} onChange={handleTransEditChange} className="w-24 px-2 py-1 border rounded bg-white" />) : (<span className="font-bold text-slate-600">{t.modelName || '-'}</span>)}</td>)}
                                        {item.type === 'product' && (<><td className="px-4 py-3">{editingTransactionId === t.id ? (<input name="userId" value={transEditData.userId || ''} onChange={handleTransEditChange} className="w-24 px-2 py-1 border rounded bg-white" />) : (<span className="font-bold text-indigo-600">{t.userId || '-'}</span>)}</td><td className="px-4 py-3">{editingTransactionId === t.id ? (<input name="serialNumber" value={transEditData.serialNumber || ''} onChange={handleTransEditChange} className="w-24 px-2 py-1 border rounded bg-white uppercase" />) : (<span className="font-mono font-bold text-slate-500">{t.serialNumber || '-'}</span>)}</td><td className="px-4 py-3">{editingTransactionId === t.id ? (<div className="space-y-1"><input name="customerName" value={transEditData.customerName || ''} onChange={handleTransEditChange} placeholder="이름" className="w-full px-2 py-1 border rounded bg-white" /><input name="phoneNumber" value={transEditData.phoneNumber || ''} onChange={handleTransEditChange} placeholder="번호" className="w-full px-2 py-1 border rounded bg-white" /></div>) : (<><p className="font-bold text-slate-800">{t.customerName || '-'}</p><p className="text-slate-500">{t.phoneNumber || '-'}</p></>)}</td><td className="px-4 py-3">{editingTransactionId === t.id ? (<input name="address" value={transEditData.address || ''} onChange={handleTransEditChange} placeholder="주소" className="w-full px-2 py-1 border rounded bg-white" />) : (<p className="text-slate-600 font-medium truncate max-w-[150px]" title={t.address}>{t.address || '-'}</p>)}</td></>)}
                                        <td className="px-4 py-3">{editingTransactionId === t.id ? (<input name="remarks" value={transEditData.remarks || ''} onChange={handleTransEditChange} placeholder="비고" className="w-full px-2 py-1 border rounded bg-white" />) : (<p className="text-[10px] text-slate-400 font-bold truncate max-w-[200px]">{t.remarks || '-'}</p>)}</td>
                                        <td className="px-4 py-3 text-center"><div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {editingTransactionId === t.id ? (<><button onClick={() => handleSaveTransEdit(t.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded"><CheckIcon className="w-4 h-4" /></button><button onClick={() => setEditingTransactionId(null)} className="p-2 text-slate-400 hover:bg-slate-50 rounded"><CloseIcon className="w-4 h-4" /></button></>) : (<><button onClick={() => handleEditTransaction(t)} className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><EditIcon className="w-4 h-4" /></button><button onClick={() => handleDeleteTrans(t.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><TrashIcon className="w-4 h-4" /></button></>)}
                                          </div></td></tr>
                                ))}</tbody></table></div>
                    )}
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemDetailModal;
