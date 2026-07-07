# ChatGPT Auto Upload Helper - Chrome Extension for DALL-E 3 Batch Generation

**ChatGPT Auto Upload Helper** is a powerful productivity Chrome Extension designed for digital artists, designers, and AI creators. It automates image reference handling, template variables, and batch generation pipelines for DALL-E 3 directly inside ChatGPT.

---

## Key Features

### 🆓 Free Tier (Core Productivity Tools)
- **Reference Image Manager**: Attach multiple reference images (character sheets, backgrounds, foods) directly to ChatGPT in one click.
- **Fixed Generation Rules**: Automatically append customizable aspect ratio parameters (16:9, 9:16, 4:3, etc.) and common style suffixes to your prompts.
- **Manual Prompt Cards**: Convert multi-line prompts into clickable cards for fast, manual insertion into the ChatGPT text area.
- **Bilingual Interface**: Support for English and Korean language localization.

### 👑 Pro Tier (Automation & Efficiency)
- **Dynamic Template Variables (`{{ variable }}`)**: Use double curly braces inside prompts. Clicking a card pops up a dialog allowing you to fill in variables on-the-fly to compile complex prompts instantly.
- **Sequence Runner (Sequential Auto-Generation)**: Run a series of prompts sequentially. The extension uploads reference images, inputs the prompt, clicks send, waits for the generation to complete (detecting DALL-E 3 tool calls and image render states), and proceeds to the next prompt automatically.
- **Multi-Language Expansion**: Access localization for 8 languages (English, Korean, Japanese, Chinese, Spanish, French, Thai, Indonesian).

---

## Subscription & Pricing

ChatGPT Auto Upload Helper offers a premium upgrade powered by **Lemon Squeezy**:
- **Pricing**: $9.99 / month (or custom store tier)
- **Features Unlocked**: Dynamic Template Variables, Sequential Generation Pipeline, Priority Support.
- **Payment Processor**: Lemon Squeezy is the Merchant of Record (MoR) for all subscriptions, ensuring safe and secure checkout.

---

## Installation & Setup

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** (압축해제된 확장 프로그램을 로드합니다) and select the extension directory.

---

## Technical Details

- **Framework**: Chrome Extension Manifest V3 (Vanilla JS, HTML5, CSS3)
- **Database & Authentication**: Supabase (PostgreSQL, Google OAuth 2.0)
- **Billing Integration**: Lemon Squeezy Webhooks to Supabase Database

---

## Privacy & Support

- **Privacy Policy**: We do not collect or store your private images. All reference images are processed locally in your browser memory.
- **Support**: For billing inquiries, feedback, or technical support, please contact: `support@seedpearl.com`

---

# ChatGPT Auto Upload Helper (한국어 소개)

ChatGPT 대화에서 반복적인 이미지 생성 작업을 자동화하고 보조하는 크롬 확장 프로그램입니다.

## 주요 기능

### 🆓 무료 버전
- **참조 이미지 일괄 업로드**: 여러 장의 캐릭터 시트/배경 이미지를 원클릭으로 ChatGPT에 업로드.
- **고정 생성 설정**: 원하는 비율 및 공통 지시문을 설정하여 카드 클릭 시 프롬프트 뒤에 자동으로 첨부.
- **수동 프롬프트 카드**: 긴 텍스트를 줄바꿈 기준으로 카드로 변환하여 원클릭 복사/붙여넣기 지원.

### 👑 Pro 버전 (유료 구독)
- **템플릿 변수 지원 (`{{ 변수 }}`)**: 프롬프트 내에 변수를 삽입하여 클릭 시 동적으로 텍스트를 변경할 수 있는 입력 모달창 지원.
- **시퀀스 자동 연속 실행**: 프롬프트 카드 전체를 연쇄적으로 자동 실행. ChatGPT의 DALL-E 3 이미지 생성이 끝날 때까지 실시간으로 추적하여 다음 단계를 순차적으로 자동 실행.
- **8개 국어 실시간 다국어 지원**: 영어, 한국어, 일본어, 중국어, 스페인어, 프랑스어, 태국어, 인도네시아어 지원.

## 개인정보 보호 & 기술 지원

- **개인정보 보호 정책**: 유저의 개인 이미지를 수집하거나 서버에 저장하지 않습니다. 모든 업로드 이미지는 브라우저 로컬 메모리 내에서 안전하게 처리됩니다.
- **고객 지원**: 결제 문의, 피드백 및 기술 지원이 필요하신 경우 `support@seedpearl.com`으로 연락해 주세요.
