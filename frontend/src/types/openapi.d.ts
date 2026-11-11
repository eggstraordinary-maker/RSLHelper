// Generated from FastAPI OpenAPI. Run npm run api:generate.
export interface paths {
    "/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Root */
        get: operations["root__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get All Users
         * @description Получить список всех пользователей (только для администратора).
         */
        get: operations["get_all_users_admin_users_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete User
         * @description Удалить пользователя по ID (только для администратора).
         */
        delete: operations["delete_user_admin_users__user_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/current-language": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Current Language
         * @description Возвращает текущий язык пользователя
         */
        get: operations["get_current_language_api_current_language_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/set-language": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set Language
         * @description Устанавливает язык пользователя
         */
        post: operations["set_language_api_set_language_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/change-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Change Password */
        post: operations["change_password_auth_change_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/forgot-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Forgot Password */
        post: operations["forgot_password_auth_forgot_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Logout */
        post: operations["logout_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refresh Token */
        post: operations["refresh_token_auth_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Создать аккаунт и отправить подтверждение */
        post: operations["register_auth_register_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/resend-verification": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Повторно отправить подтверждение */
        post: operations["resend_verification_auth_resend_verification_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset Password */
        post: operations["reset_password_auth_reset_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify Email From Body */
        post: operations["verify_email_from_body_auth_verify_email_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/verify-email/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify Email */
        post: operations["verify_email_auth_verify_email__token__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health Check */
        get: operations["health_check_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/progress/complete/{word}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Complete Legacy Lesson
         * @deprecated
         */
        post: operations["complete_legacy_lesson_progress_complete__word__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/progress/legacy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Unresolved Progress */
        get: operations["unresolved_progress_progress_legacy_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/progress/lessons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Progress */
        get: operations["list_progress_progress_lessons_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/progress/lessons/{lesson_id}/attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Сохранить самостоятельную попытку
         * @description Доступно владельцу прогресса для опубликованного урока. Повтор attempt_id с теми же lesson_id/completed возвращает исходный результат, если текущий доступ к уроку сохранён. Без attempt_id каждый вызов — новая попытка.
         */
        post: operations["practice_lesson_progress_lessons__lesson_id__attempts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/progress/lessons/{lesson_id}/completion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Complete Lesson */
        put: operations["complete_lesson_progress_lessons__lesson_id__completion_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/progress/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Progress Stats */
        get: operations["get_progress_stats_progress_stats_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/recognition/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Recognition Status */
        get: operations["recognition_status_recognition_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Users Me
         * @description Получение информации о текущем пользователе
         */
        get: operations["read_users_me_users_me_get"];
        /** Update User Profile */
        put: operations["update_user_profile_users_me_put"];
        post?: never;
        /** Delete User Account */
        delete: operations["delete_user_account_users_me_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/videos/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Videos
         * @deprecated
         */
        get: operations["list_videos_videos__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/videos/lessons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Получить опубликованные уроки */
        get: operations["list_lessons_videos_lessons_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/videos/lessons/{lesson_id}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Получить MP4 опубликованного урока */
        get: operations["lesson_content_videos_lessons__lesson_id__content_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        /** Проверить метаданные MP4 без загрузки тела */
        head: operations["lesson_content_head_videos_lessons__lesson_id__content_head"];
        patch?: never;
        trace?: never;
    };
    "/videos/stream/{object_name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Stream Video
         * @deprecated
         */
        get: operations["stream_video_videos_stream__object_name__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/videos/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Загрузить проверенный MP4 урока
         * @deprecated
         * @description Только администратор. MP4 с H.264: до 100 МБ (100 000 000 байт) и 15 секунд; настройки развёртывания могут уменьшить лимиты. Legacy-ответ содержит внутренний ключ; публичный каталог использует lesson_id.
         */
        post: operations["upload_video_videos_upload_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/videos/{object_name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Video
         * @deprecated
         */
        get: operations["get_video_videos__object_name__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** Body_login_auth_login_post */
        Body_login_auth_login_post: {
            /** Client Id */
            client_id?: string | null;
            /**
             * Client Secret
             * Format: password
             */
            client_secret?: string | null;
            /** Grant Type */
            grant_type?: string | null;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Scope
             * @default
             */
            scope: string;
            /** Username */
            username: string;
        };
        /** Body_upload_video_videos_upload_post */
        Body_upload_video_videos_upload_post: {
            /**
             * Description
             * @default
             */
            description: string;
            /** File */
            file: string;
        };
        /** DeleteAccountRequest */
        DeleteAccountRequest: {
            /** Password */
            password: string;
        };
        /** EmailVerificationRequest */
        EmailVerificationRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /** EmailVerificationTokenRequest */
        EmailVerificationTokenRequest: {
            /** Token */
            token: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** LanguageRequest */
        LanguageRequest: {
            /** Lang */
            lang: string;
        };
        /** LegacyProgress */
        LegacyProgress: {
            /** Attempts */
            attempts: number | null;
            /** Completed */
            completed: boolean | null;
            /** Completed At */
            completed_at: string | null;
            /** Progress Id */
            progress_id: number;
            /** Status */
            status: string;
            /** Word */
            word: string;
        };
        /**
         * LessonResponse
         * @description Published lesson contract independent of the internal object-store key.
         */
        LessonResponse: {
            /** Description */
            description: string | null;
            /** Filename */
            filename: string;
            /** Id */
            id: number;
            /** Is Published */
            is_published: boolean;
            /** Lesson Id */
            lesson_id: string;
            /**
             * Media Url
             * @description Relative API URL of the published MP4
             */
            media_url: string;
        };
        /** PasswordChange */
        PasswordChange: {
            /** Current Password */
            current_password: string;
            /** New Password */
            new_password: string;
        };
        /** PasswordResetConfirm */
        PasswordResetConfirm: {
            /** New Password */
            new_password: string;
            /** Token */
            token: string;
        };
        /** PasswordResetRequest */
        PasswordResetRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /** PracticeAttempt */
        PracticeAttempt: {
            /**
             * Attempt Id
             * @description Client-generated UUID reused until this practice is acknowledged. The same user/ID/payload returns the original result; a different payload gives 409. Without an ID each call remains a new practice for legacy clients.
             */
            attempt_id?: string | null;
            /**
             * Completed
             * @default false
             */
            completed: boolean;
        };
        /** ProgressStats */
        ProgressStats: {
            /** Completed Lessons */
            completed_lessons: number;
            /** Completed Percentage */
            completed_percentage: number;
            /** Recent Lessons */
            recent_lessons: string[];
            /** Total Lessons */
            total_lessons: number;
            /**
             * Unresolved Legacy Records
             * @default 0
             */
            unresolved_legacy_records: number;
        };
        /** ProviderStatus */
        ProviderStatus: {
            /** Available */
            available: boolean;
            /** Configured */
            configured: boolean;
            /**
             * Max Frame Bytes
             * @default 262144
             */
            max_frame_bytes: number;
            /**
             * Max Frames Per Second
             * @default 5
             */
            max_frames_per_second: number;
            /**
             * Max In Flight
             * @default 2
             */
            max_in_flight: number;
            /**
             * Protocol Version
             * @default 1.0
             * @constant
             */
            protocol_version: "1.0";
            /**
             * Reason
             * @enum {string}
             */
            reason: "not_configured" | "provider_unavailable" | "ready";
            /**
             * Transport
             * @default websocket
             * @constant
             */
            transport: "websocket";
        };
        /** RefreshTokenRequest */
        RefreshTokenRequest: {
            /** Refresh Token */
            refresh_token: string;
        };
        /** Token */
        Token: {
            /** Access Token */
            access_token: string;
            /** Refresh Token */
            refresh_token: string;
            /**
             * Token Type
             * @default bearer
             */
            token_type: string;
        };
        /** UserCreate */
        UserCreate: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
            /** Username */
            username: string;
        };
        /** UserProgress */
        UserProgress: {
            /**
             * Attempts
             * @default 0
             */
            attempts: number;
            /**
             * Completed
             * @default false
             */
            completed: boolean;
            /** Completed At */
            completed_at: string | null;
            /** Id */
            id: number;
            /** Lesson Id */
            lesson_id: string;
            /** User Id */
            user_id: number;
            /** Word */
            word: string;
        };
        /** UserResponse */
        UserResponse: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Full Name */
            full_name?: string | null;
            /** Id */
            id: number;
            /** Is Active */
            is_active: boolean;
            /** Is Verified */
            is_verified: boolean;
            /** Public Id */
            public_id: string;
            /** Role */
            role: string;
            /** Username */
            username: string;
        };
        /** UserUpdate */
        UserUpdate: {
            /** Full Name */
            full_name?: string | null;
            /** Username */
            username?: string | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** VideoResponse */
        VideoResponse: {
            /** Description */
            description: string | null;
            /** Filename */
            filename: string;
            /** Id */
            id: number;
            /** Is Published */
            is_published: boolean;
            /** Lesson Id */
            lesson_id: string;
            /** Object Name */
            object_name: string | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    root__get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    get_all_users_admin_users_get: {
        parameters: {
            query?: {
                skip?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_admin_users__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_current_language_api_current_language_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    set_language_api_set_language_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LanguageRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    change_password_auth_change_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordChange"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    forgot_password_auth_forgot_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordResetRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["Body_login_auth_login_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Token"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshTokenRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refresh_token_auth_refresh_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshTokenRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Token"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    register_auth_register_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Аккаунт создан, доставка не завершена; повторите /auth/resend-verification */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    resend_verification_auth_resend_verification_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmailVerificationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Доставка временно недоступна; запрос можно повторить */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    reset_password_auth_reset_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordResetConfirm"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_email_from_body_auth_verify_email_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmailVerificationTokenRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    verify_email_auth_verify_email__token__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    health_check_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    complete_legacy_lesson_progress_complete__word__post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                word: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserProgress"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unresolved_progress_progress_legacy_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LegacyProgress"][];
                };
            };
        };
    };
    list_progress_progress_lessons_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserProgress"][];
                };
            };
        };
    };
    practice_lesson_progress_lessons__lesson_id__attempts_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lesson_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PracticeAttempt"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserProgress"];
                };
            };
            /** @description ID попытки уже использован с другими данными */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_lesson_progress_lessons__lesson_id__completion_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lesson_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserProgress"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_progress_stats_progress_stats_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgressStats"];
                };
            };
        };
    };
    recognition_status_recognition_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProviderStatus"];
                };
            };
        };
    };
    read_users_me_users_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"];
                };
            };
        };
    };
    update_user_profile_users_me_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_account_users_me_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeleteAccountRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_videos_videos__get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VideoResponse"][];
                };
            };
        };
    };
    list_lessons_videos_lessons_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LessonResponse"][];
                };
            };
        };
    };
    lesson_content_videos_lessons__lesson_id__content_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lesson_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Один диапазон байтов */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Урок не опубликован или отсутствует */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Диапазон вне файла */
            416: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lesson_content_head_videos_lessons__lesson_id__content_head: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                lesson_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    stream_video_videos_stream__object_name__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                object_name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_video_videos_upload_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_video_videos_upload_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VideoResponse"];
                };
            };
            /** @description Превышен лимит размера */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Недопустимый MP4 */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description Хранилище или проверка временно недоступны */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_video_videos__object_name__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                object_name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
