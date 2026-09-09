"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import data from "./guide-data.json";
import s from "./guide.module.css";

const groups = ["시험 준비", "판독과 검수", "성적표와 발송"];
type Step = (typeof data.steps)[number];
// Positions refer to the original screenshots; markers sit beside the controls.
const markers: Record<string, number[][]> = {
  create: [[2,21],[49,35],[49,53]], key: [[3,27],[3,42],[88,10]],
  scan: [[3,27],[33,27],[3,50]], reports: [[38,11],[78,24],[90,24]],
  comments: [[2,25],[2,60],[90,39]], send: [[2,18],[2,36],[88,82]],
};
function Screen({ step }: { step: Step }) {
  return <div className={s.imageCanvas}><Image src={step.image} alt={step.caption} width={step.width} height={step.height} sizes="(max-width: 800px) 100vw, 1200px" unoptimized loading="lazy" />{markers[step.id]?.map(([x,y],i) => <span key={i} className={s.marker} style={{left:`${x}%`,top:`${y}%`}} aria-hidden>{i+1}</span>)}</div>;
}

export default function Guide() {
  const [active, setActive] = useState("start");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState<Step | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<string[]>([]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
    }, { rootMargin: "-12% 0px -68% 0px" });
    document.querySelectorAll("[data-guide-section]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
    else dialog.current?.close();
  }, [zoom]);
  useEffect(() => {
    let previous: boolean[] = [];
    const before = () => {
      flushSync(() => setQuery(""));
      const details = Array.from(document.querySelectorAll<HTMLDetailsElement>("#help details"));
      previous = details.map(item => item.open);
      details.forEach(item => { item.open = true; });
    };
    const after = () => document.querySelectorAll<HTMLDetailsElement>("#help details").forEach((item,i) => { item.open = previous[i] ?? false; });
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  const faqs = data.faqs.filter(f => `${f.q} ${f.a}`.includes(query.trim()));
  const count = data.steps.findIndex(step => step.id === active) + 1;

  return <div className={s.guide}>
    <a className={s.skip} href="#content">본문으로 건너뛰기</a>
    <header className={s.header}>
      <a href="#start" className={s.brand}><Image src="/academy-logo.png" width={48} height={48} alt="목동유쌤영어학원" /><span><b>OMR 리포트</b><small>선생님을 위한 사용 가이드</small></span></a>
      <div className={s.headerActions}><button onClick={() => window.print()}>인쇄 / PDF 저장</button><a href="/login">프로그램 열기 <span aria-hidden>↗</span></a></div>
    </header>
    <div className={s.layout}>
      <aside className={s.sidebar}>
        <p className={s.overline}>GUIDE CONTENTS</p>
        <nav aria-label="가이드 목차">
          <a href="#start" aria-current={active === "start" ? "location" : undefined}>처음 시작하기</a>
          {groups.map((g, gi) => <div key={g} className={s.navGroup}><p>{String(gi + 1).padStart(2, "0")} · {g}</p>{data.steps.filter(step => step.group === g).map(step => {
            const no = data.steps.indexOf(step) + 1;
            return <a href={`#${step.id}`} key={step.id} aria-current={active === step.id ? "location" : undefined}><span>{String(no).padStart(2, "0")}</span>{step.title.replace("확인 필요한 답안 ", "").replace("미리보기 확인 후 ", "").replace("학생 확인 후 ", "").replace(" 작성하고 저장하기", " 작성하기")}{step.optional && <i>선택</i>}</a>;
          })}</div>)}
          <a href="#checklist" aria-current={active === "checklist" ? "location" : undefined}>발송 전 체크리스트</a>
          <a href="#help" aria-current={active === "help" ? "location" : undefined}>막혔을 때 · FAQ</a>
        </nav>
        <div className={s.navTip}><b>이 세 가지만 기억하세요</b><p>출결번호 <strong>5자리</strong><br/>스캔 <strong>흑백 · 200dpi</strong><br/>PDF <strong>30쪽 이하</strong></p></div>
        <small className={s.version}>화면 확인 2026.09.09 · v1.25.1</small>
      </aside>
      <main id="content" className={s.main}>
        <section id="start" data-guide-section className={s.hero}>
          <div className={s.heroTop}><span className={s.eyebrow}>YUSSAM · TEACHER’S HANDBOOK</span><span className={s.edition}>2026 EDITION</span></div>
          <h1>시험 준비부터 발송까지,<br/><em>화면을 보며 한 단계씩.</em></h1>
          <p className={s.lead}>처음 사용하는 선생님도 흐름을 놓치지 않도록.<br/>누를 곳, 해야 할 일, 완료 기준을 함께 정리했습니다.</p>
          <div className={s.heroButtons}><a href="#create">첫 단계 시작하기 <span aria-hidden>→</span></a><a href="#help">막힌 부분 찾기 ↓</a></div>
          <div className={s.journey}>{groups.map((g,i) => <a key={g} href={`#${data.steps[i*3].id}`}><span>0{i+1}</span><b>{g}</b><small>{["시험 생성 · 출력 · 정답 입력","스캔 업로드 · 검수 · 주관식","성적표 생성 · 의견 · 알림톡"][i]}</small></a>)}</div>
        </section>
        <section className={s.startCard}>
          <div className={s.startIcon} aria-hidden>↗</div><div><h2>먼저, 학원 슬랙 계정으로 로그인하세요.</h2><p><a href="/login">로그인 화면</a>에서 <b>슬랙으로 로그인</b>을 누르세요. 로그인 후 왼쪽 메뉴의 <b>OMR 시험</b>에서 시작합니다.</p><small>서술형이 없으면 6단계, 담임 의견을 쓰지 않으면 8단계는 건너뛰세요.</small></div>
        </section>
        <div className={s.readingNote}><span aria-hidden>i</span><p><b>화면은 눌러서 크게 볼 수 있어요.</b> 실제 캡처 6장과 가상 데이터로 만든 기존 예시 3장을 구분해 표시했습니다. 성적표를 먼저 만든 뒤 학생별 담임 의견을 작성하세요.</p></div>
        {data.steps.map((step, index) => <section key={step.id} id={step.id} data-guide-section className={s.step}>
          <div className={s.stepHead}><span className={s.number}>{String(index+1).padStart(2,"0")}</span><div><div className={s.stepMeta}>{step.group}{step.optional && <span>{step.optional}</span>}</div><h2>{step.title}</h2></div></div>
          <p className={s.intro}>{step.intro}</p>
          <div className={s.route}><span>어디서 하나요?</span><b>{step.where}</b></div>
          <figure className={s.figure}>
            <div className={s.figureBar}><span><i aria-hidden/><i aria-hidden/><i aria-hidden/></span><b>{step.source}</b><span>클릭하여 확대 ↗</span></div>
            <button className={`${s.shot} ${step.id === "reports" || step.id === "scan" ? s.shortShot : ""}`} onClick={() => setZoom(step)} aria-label={`${index+1}단계 ${step.title} 화면 확대`}>
              <Screen step={step} />
            </button>
            <figcaption>{step.caption}</figcaption>
          </figure>
          <div className={s.focus}>{step.focus.map((f, i) => <span key={f}><b>{i+1}</b>{f}</span>)}</div>
          <ol className={s.actions}>{step.actions.map(([title, body], i) => <li key={title}><span>{i+1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
          <div className={s.tip}><span aria-hidden>!</span><div><h3>{step.tipTitle}</h3><p>{step.tip}</p></div></div>
          <div className={s.done}><span aria-hidden>✓</span><div><b>여기까지 됐으면 다음 단계로</b><p>{step.done}</p></div></div>
          {index < 8 && <a className={s.next} href={`#${data.steps[index+1].id}`}>다음 · {data.steps[index+1].title} <span aria-hidden>→</span></a>}
        </section>)}
        <section id="checklist" data-guide-section className={s.checklist}>
          <span className={s.eyebrow}>BEFORE YOU SEND</span><h2>보내기 전, 마지막 확인.</h2><p>실제 발송 화면에서 아래 항목을 확인해 주세요.</p>
          {['학생 이름과 출결번호가 정확합니다.','정답·검수·주관식 채점이 모두 끝났습니다.','성적표의 점수와 담임 의견을 확인했습니다.','시험명·응시일·수신자와 연락처를 확인했습니다.','이미 보낸 대상의 중복 발송 여부를 확인했습니다.'].map(item => <label key={item}><input type="checkbox" checked={checked.includes(item)} onChange={e => setChecked(prev => e.target.checked ? [...prev,item] : prev.filter(v => v !== item))}/><span>{item}</span></label>)}
          <small aria-live="polite">{checked.length} / 5개 확인 · 이 체크는 가이드 안에서만 적용되며 발송하지 않습니다.</small>
        </section>
        <section id="help" data-guide-section className={s.help}><span className={s.overline}>QUICK HELP</span><h2>어디에서 막히셨나요?</h2><label className={s.search}><span aria-hidden>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="예: 성적표, 수험번호, 엑셀" aria-label="자주 묻는 질문 검색"/>{query && <button onClick={() => setQuery("")} aria-label="검색어 지우기">×</button>}</label><p className={s.result} aria-live="polite">{faqs.length}개의 도움말</p>{faqs.map(f => <details key={f.q} className={s.faq}><summary>{f.q}<span aria-hidden>+</span></summary><p>{f.a}</p><a href={`#${f.step}`}>해당 단계로 이동 →</a></details>)}{!faqs.length && <p className={s.empty}>일치하는 도움말이 없습니다. 더 짧은 단어로 검색하거나 운영진에게 문의해 주세요.</p>}</section>
        <footer className={s.footer}><b>목동유쌤영어학원 · OMR 리포트</b><p>화면이 다르거나 해결되지 않는 문제가 있으면 시험 제목과 오류 문구를 운영진에게 알려 주세요.</p><small>기존 사용설명서와 실제 프로그램(v1.25.1), 소스 코드 기준으로 정리했습니다. · 2026.09.09</small><a href="#start">처음으로 ↑</a></footer>
      </main>
    </div>
    <div className={s.mobileNav}><span>{count > 0 ? `${String(count).padStart(2,"0")} / 09` : "사용 가이드"}</span><a href="#start">목차 ↑</a><a href="#help">도움말</a></div>
    <dialog ref={dialog} className={s.dialog} aria-label={zoom ? `${zoom.title} 화면 확대` : "화면 확대"} onCancel={() => setZoom(null)} onClick={e => {if (e.target === e.currentTarget) setZoom(null);}}>
      {zoom && <><div className={s.dialogHead}><b>{zoom.title}</b><button autoFocus onClick={() => setZoom(null)} aria-label="확대 화면 닫기">닫기 ×</button></div><div className={s.zoomScroll}><Screen step={zoom} /></div><p>{zoom.source} · {zoom.caption}</p></>}
    </dialog>
  </div>;
}
