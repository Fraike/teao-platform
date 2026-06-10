export interface Employee {
  id: string;
  employeeNo: string;
  name: string;
  gender: "男" | "女";
  idCard: string;
  birthDate: string;
  age: number;
  phone: string;
  department: string;
  position: string;
  education: string;
  address: string;
  entryDate: string;
  status: "active" | "resigned";
  resignDate?: string;
  dormitory: boolean;
  signedContract: boolean;
  contractType: string;
  contractStartDate: string;
  contractEndDate: string;
  contractRemainingDays: number;
  idCardExpiry: string;
  yearsOfService: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeFormData {
  employeeNo: string;
  name: string;
  gender: "男" | "女";
  idCard: string;
  phone: string;
  department: string;
  position: string;
  education: string;
  address: string;
  entryDate: string;
  dormitory: boolean;
  signedContract: boolean;
  contractType: string;
  contractStartDate: string;
  contractEndDate: string;
  idCardExpiry: string;
  remark: string;
}
