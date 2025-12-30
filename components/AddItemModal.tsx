
import React, { useState, useEffect, useMemo } from 'react';
import type { Item } from '../types';
import { CloseIcon } from './icons';

interface AddItemModalProps {
  onAddItem: (item: Omit<Item, 'id' | 'transactions'>, initialQuantity: number) => void;
  onClose: () => void;
  existingCodes: string[];
  defaultType: 'part' | 'product';
}

const AddItemModal: React.FC<AddItemModalProps> = ({ onAddItem, onClose, existingCodes, defaultType }) => {
  const [prefix, setPrefix] = useState('');
  const [itemType, setItemType] = useState<'part' | 'product'>(defaultType);
  const [formData, setFormData] = useState({
    registrationDate: new Date().toISOString().split('T')[0],
    code: '',
    name: '',
    drawingNumber: '',
    spec: '', // 규격 추가
    remarks: '',
    initialQuantity: '0'
  });

  useEffect(() => {
    const upperPrefix = prefix.toUpperCase();
    if (!upperPrefix.trim()) {
      setFormData(prev => ({ ...prev, code: '' }));
      return;
    }
    const regex = new RegExp(`^${upperPrefix}(\\d+)$`);
    let maxNum = 0;
    existingCodes.forEach(code => {
      if (!code) return;
      const match = code.toUpperCase().match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    setFormData(prev => ({ ...prev, code: `${upperPrefix}${maxNum + 1}` }));
  }, [prefix, existingCodes]);

  const isCodeDuplicate = useMemo(() => {
    if (!formData.code.trim()) return false;
    return existingCodes.some(c => c.toUpperCase() === formData.code.trim().toUpperCase());
  }, [formData.code, existingCodes]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // 코드와 품명(name)만 항상 대문자로 변환
    const upperOnlyFields = ['code', 'name'];
    const processedValue = upperOnlyFields.includes(name) ? value.toUpperCase() : value;
    setFormData(prev => ({ ...prev, [name]: processedValue }));
  };

  const handlePrefixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrefix(e.target.value.toUpperCase());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) {
      alert('품명과 코드는 필수 항목입니다.');
      return;
    }
    if (isCodeDuplicate) {
      alert('이미 사용 중인 코드입니다. 코드를 변경해주세요.');
      return;
    }
    const { initialQuantity, ...rest } = formData;
    const quantity = parseInt(initialQuantity, 10) || 0;
    onAddItem({
      ...rest,
      type: itemType,
      modelName: '',
      application: ''
    }, quantity);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-up overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">신규 {itemType === 'part' ? '부품' : '제품'} 등록</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="flex p-1 bg-slate-100 rounded-xl mb-2">
                <button type="button" onClick={() => setItemType('part')} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${itemType === 'part' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>부품</button>
                <button type="button" onClick={() => setItemType('product')} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${itemType === 'product' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>제품</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="registrationDate" className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">날짜</label>
                    <input type="date" name="registrationDate" id="registrationDate" value={formData.registrationDate} onChange={handleChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                    <label htmlFor="prefix" className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">코드 접두어</label>
                    <input type="text" id="prefix" value={prefix} onChange={handlePrefixChange} placeholder="예: CT" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold" />
                </div>
            </div>
            <div className="relative">
              <label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">생성된 코드 (자동/수동)</label>
              <input 
                type="text" 
                name="code" 
                value={formData.code} 
                onChange={handleChange} 
                className={`w-full px-4 py-2 rounded-lg text-indigo-600 font-mono font-black border focus:ring-2 outline-none ${isCodeDuplicate ? 'bg-rose-50 border-rose-500 focus:ring-rose-200' : 'bg-indigo-50/50 border-indigo-100 focus:ring-indigo-500'}`} 
                placeholder="코드를 입력하세요" 
              />
              {isCodeDuplicate && <p className="text-[9px] text-rose-500 font-black mt-1 uppercase">중복된 코드입니다</p>}
            </div>
            <div>
              <label htmlFor="name" className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">{itemType === 'part' ? '부품명' : '제품명'} <span className="text-rose-500">*</span></label>
              <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} required className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold" />
            </div>
            {itemType === 'part' && (
              <>
                <div>
                    <label htmlFor="drawingNumber" className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">도번</label>
                    <input type="text" name="drawingNumber" id="drawingNumber" value={formData.drawingNumber} onChange={handleChange} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold" placeholder="도번을 입력하세요" />
                </div>
                <div>
                    <label htmlFor="spec" className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">규격</label>
                    <input type="text" name="spec" id="spec" value={formData.spec} onChange={handleChange} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium" placeholder="규격을 입력하세요" />
                </div>
              </>
            )}
            <div>
              <label htmlFor="initialQuantity" className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">초기 수량</label>
              <input type="number" name="initialQuantity" id="initialQuantity" min="0" value={formData.initialQuantity} onChange={handleChange} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-black" />
            </div>
            <div>
              <label htmlFor="remarks" className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">비고</label>
              <textarea name="remarks" id="remarks" value={formData.remarks} onChange={handleChange} rows={2} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"></textarea>
            </div>
          </div>
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button type="submit" className="w-full px-6 py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 uppercase tracking-widest text-xs">
              새 {itemType === 'part' ? '부품' : '제품'} 등록하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItemModal;
