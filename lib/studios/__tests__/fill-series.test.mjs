import { detectFillSeries as f } from '../fill-series.ts';
let pass=0, fail=0;
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function t(name, got, want){ if(eq(got,want)){pass++; /*console.log('PASS',name)*/} else {fail++; console.log('FAIL',name,'\n  got ',JSON.stringify(got),'\n  want',JSON.stringify(want));} }

// 1. numeric +1
t('1,2 -> 3,4,5,6', f(['1','2'],4), ['3','4','5','6']);
// 2. numeric step 10
t('10,20 -> 30,40', f(['10','20'],2), ['30','40']);
// 3. single number defaults +1
t('5 -> 6,7', f(['5'],2), ['6','7']);
// 4. negative step
t('5,3 -> 1,-1', f(['5','3'],2), ['1','-1']);
// 5. decimals
t('1.5,2.0 -> 2.5,3', f(['1.5','2'],2), ['2.5','3']);
// 6. month names full
t('January -> February,March', f(['January'],2), ['February','March']);
// 7. month abbrev
t('Jan,Feb -> Mar,Apr', f(['Jan','Feb'],2), ['Mar','Apr']);
// 8. weekday wrap
t('Sat,Sun -> Mon (wrap)', f(['Saturday','Sunday'],1), ['Monday']);
// 9. weekday lowercase abbr
t('mon -> tue,wed', f(['mon'],2), ['tue','wed']);
// 10. ISO date +1 day
t('2024-01-30 -> 31, 02-01', f(['2024-01-30'],2), ['2024-01-31','2024-02-01']);
// 11. ISO date step 7
t('2024-01-01,01-08 -> 01-15', f(['2024-01-01','2024-01-08'],1), ['2024-01-15']);
// 12. prefix-N
t('Item 1,Item 2 -> Item 3,4', f(['Item 1','Item 2'],2), ['Item 3','Item 4']);
// 13. Q-prefix with suffix-less
t('Q1 -> Q2,Q3', f(['Q1'],2), ['Q2','Q3']);
// 14. reverse numeric
t('reverse 3,4 -> 2,1', f(['3','4'],2,true), ['2','1']);
// 15. copy fallback (non-series text)
t('apple -> apple,apple', f(['apple'],2), ['apple','apple']);
// 16. empty source
t('empty -> blanks', f(['',''],2), ['','']);

console.log(`\n${pass}/${pass+fail} PASS`);
process.exit(fail?1:0);
