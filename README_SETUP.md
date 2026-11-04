# 엔카 HEV 승계 감시 — PC 자동 수집 (2026-11-04 전환)

## 왜 PC인가
- GitHub Actions(미국 IP): api.encar.com 이 404 → 수집 불가
- Claude 클라우드/PC 연결 VM: api.encar.com 이 허용 도메인 밖 → 차단
- 그래서 DD의 Windows PC가 매주 월 08:00에 `node scripts/collect.mjs` 를 돌리고 GitHub 에 push (한국 IP, Chrome 불필요)

## 설치 (1회)
1. 저장소에서 `scripts/windows/setup_encar.ps1` 를 받아 (또는 Downloads/encar_actions/ 에 있는 복사본) 오른쪽 클릭 → "PowerShell로 실행"
2. git / node 가 없으면 안내대로 `winget install` 후 다시 실행
3. 스크립트가 `%USERPROFILE%\encar-lease` 에 저장소를 복제하고 작업 스케줄러에 "Encar HEV 승계 수집" 을 등록
4. "지금 1회 실행" 에 Y → 첫 push 때 GitHub 로그인 창(브라우저)이 한 번 뜸 → 로그인하면 이후 자동

## 매주 동작
- 월 08:00 (PC 꺼져 있으면 다음 켜질 때) `run_encar.cmd` 실행 → watch.html / watch_data.json / watch_history.json / report.json / report.md 커밋·push
- 로그: `%USERPROFILE%\encar-lease\logs\run_YYYYMMDD.log`
- 09:07 Claude 스케줄 작업이 report.json 을 읽어 푸시 알림 (Actions 미실행/실패면 그 사실을 알림)

## 페이지
https://operationer-star.github.io/encar-lease/watch.html
