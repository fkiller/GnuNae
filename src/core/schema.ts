// Resume Schema Types
export interface ResumeSchema {
    schema_version: string;
    generated_at_local: string;
    person: Person;
    employment?: Employment[];
    personal_projects?: PersonalProject[];
    education?: Education[];
}

export interface Person {
    name: {
        full: string;
        native?: string;
    };
    contact: {
        email: string;
        phone?: string;
        address?: Address;
    };
    location?: {
        city: string;
        state?: string;
        country: string;
    };
    profiles?: {
        linkedin?: string;
        github?: string;
        [key: string]: string | undefined;
    };
    demographics?: {
        gender?: string;
        ethnicity?: string;
        race?: string;
        veteran_status?: string;
        disability_status?: string;
    };
    work_authorization?: {
        country: string;
        status: string;
        requires_sponsorship: boolean;
    };
    job_preferences?: {
        earliest_start_date?: string;
        in_office_availability?: string;
    };
    compensation?: {
        current?: Compensation;
        expected?: Compensation;
    };
}

export interface Address {
    street: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
}

export interface Compensation {
    currency: string;
    base?: number;
    bonus?: number;
    total?: number;
}

export interface Employment {
    company: string;
    employment_period: {
        start_year: number;
        end_year: number | null;
    };
    roles: string[];
    projects?: Project[];
}

export interface Project {
    name: string;
    start_year?: number;
    end_year?: number | null;
    year?: number;
    year_range?: string;
    description?: string[];
    technologies: string[];
    client?: string;
}

export interface PersonalProject {
    name: string;
    year_range: string;
    technologies: string[];
}

export interface Education {
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string;
    notes?: string[];
}

// MCP Tool Types
export interface McpToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

export interface McpToolResult {
    success: boolean;
    result?: unknown;
    error?: string;
}

// IPC Message Types
export interface BrowserNavigateResult {
    success: boolean;
    url?: string;
    error?: string;
}

export interface BrowserExecuteResult {
    success: boolean;
    result?: unknown;
    error?: string;
}
