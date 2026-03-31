# Hanzi Sprint

HSK 단계별 중국어 단어를 게임처럼 학습하는 정적 웹앱입니다.

## 포함 기능

- HSK 1급부터 6급까지 단계별 단어 DB
- 한자, 핀인, 의미 동시 학습
- 플래시카드, 뜻 고르기, 핀인 고르기, 직접 입력, 오답 재도전 모드
- 오답 자동 저장 및 반복 복습
- 레벨별 숙련도와 당일 학습 통계 저장

## 실행 방법

브라우저에서 `index.html` 파일을 열면 바로 실행됩니다.

## 데이터 저장

학습 기록은 브라우저 `localStorage`에 저장됩니다.

## 단어 데이터 소스

- 기본 단어장은 `drkameleon/complete-hsk-vocabulary`의 HSK 2.0 `exclusive/old/1..6` 데이터를 기반으로 생성됩니다.
- 현재 포함된 전체 단어 수는 `4,991개`입니다.
- 뜻 데이터는 공개 소스의 영어 의미를 사용합니다.
- 공개 소스의 의미가 부정확한 경우 `data/meaning-overrides.json`에서 단어별로 직접 덮어쓸 수 있습니다.

## 단어장 재생성

전체 단어장을 다시 생성하려면 아래 명령을 실행합니다.

```bash
node scripts/generate-vocab-data.mjs
```

생성 스크립트는 공개 GitHub 원본 JSON을 내려받아 현재 앱이 사용하는 `vocab-data.js` 형식으로 변환합니다.
생성 과정에서 사전식 잡음 표현(`see ...`, `surname ...`, `variant of ...`, `lit. ...`)을 제거하고, `data/meaning-overrides.json`의 수동 수정값을 우선 적용합니다.

## 뜻 수정 방법

`data/meaning-overrides.json`에 아래 형식으로 단어를 추가한 뒤 재생성하면 됩니다.

```json
{
  "打电话": {
    "meaning": "to make a phone call",
    "meanings": ["to make a phone call", "to call"]
  }
}
```

## 확장 포인트

- 한국어 뜻 컬럼 보강
- 사용자 로그인과 서버 DB 연동
- 발음 오디오, 리더보드, 일일 퀘스트 추가
