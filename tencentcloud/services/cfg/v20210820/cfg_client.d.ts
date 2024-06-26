import { AbstractClient } from "../../../common/abstract_client";
import { ClientConfig } from "../../../common/interface";
import { DescribeTaskRequest, ModifyTaskRunStatusResponse, DeleteTaskRequest, ExecuteTaskResponse, DescribeTaskExecuteLogsRequest, DescribeTaskResponse, ModifyTaskRunStatusRequest, DescribeTemplateResponse, DescribeTemplateRequest, ExecuteTaskInstanceRequest, ExecuteTaskRequest, DescribeTaskListResponse, DescribeTemplateListResponse, DescribeTaskPolicyTriggerLogResponse, CreateTaskFromTemplateResponse, DeleteTaskResponse, DescribeTaskPolicyTriggerLogRequest, CreateTaskFromTemplateRequest, TriggerPolicyRequest, TriggerPolicyResponse, DescribeTaskListRequest, ExecuteTaskInstanceResponse, DescribeTaskExecuteLogsResponse, DescribeTemplateListRequest } from "./cfg_models";
/**
 * cfg client
 * @class
 */
export declare class Client extends AbstractClient {
    constructor(clientConfig: ClientConfig);
    /**
     * 从经验库创建演练
     */
    CreateTaskFromTemplate(req: CreateTaskFromTemplateRequest, cb?: (error: string, rep: CreateTaskFromTemplateResponse) => void): Promise<CreateTaskFromTemplateResponse>;
    /**
     * 查询经验库
     */
    DescribeTemplate(req: DescribeTemplateRequest, cb?: (error: string, rep: DescribeTemplateResponse) => void): Promise<DescribeTemplateResponse>;
    /**
     * 触发混沌演练任务的动作，对于实例进行演练操作
     */
    ExecuteTaskInstance(req: ExecuteTaskInstanceRequest, cb?: (error: string, rep: ExecuteTaskInstanceResponse) => void): Promise<ExecuteTaskInstanceResponse>;
    /**
     * 查询经验库列表
     */
    DescribeTemplateList(req: DescribeTemplateListRequest, cb?: (error: string, rep: DescribeTemplateListResponse) => void): Promise<DescribeTemplateListResponse>;
    /**
     * 修改任务运行状态
     */
    ModifyTaskRunStatus(req: ModifyTaskRunStatusRequest, cb?: (error: string, rep: ModifyTaskRunStatusResponse) => void): Promise<ModifyTaskRunStatusResponse>;
    /**
     * 用于触发混沌演练护栏（类型为触发和恢复2种）
     */
    TriggerPolicy(req: TriggerPolicyRequest, cb?: (error: string, rep: TriggerPolicyResponse) => void): Promise<TriggerPolicyResponse>;
    /**
     * 查询任务列表
     */
    DescribeTaskList(req: DescribeTaskListRequest, cb?: (error: string, rep: DescribeTaskListResponse) => void): Promise<DescribeTaskListResponse>;
    /**
     * 获取演练过程中的所有日志
     */
    DescribeTaskExecuteLogs(req: DescribeTaskExecuteLogsRequest, cb?: (error: string, rep: DescribeTaskExecuteLogsResponse) => void): Promise<DescribeTaskExecuteLogsResponse>;
    /**
     * 查询任务
     */
    DescribeTask(req: DescribeTaskRequest, cb?: (error: string, rep: DescribeTaskResponse) => void): Promise<DescribeTaskResponse>;
    /**
     * 删除任务
     */
    DeleteTask(req: DeleteTaskRequest, cb?: (error: string, rep: DeleteTaskResponse) => void): Promise<DeleteTaskResponse>;
    /**
     * 执行任务
     */
    ExecuteTask(req: ExecuteTaskRequest, cb?: (error: string, rep: ExecuteTaskResponse) => void): Promise<ExecuteTaskResponse>;
    /**
     * 获取护栏触发日志
     */
    DescribeTaskPolicyTriggerLog(req: DescribeTaskPolicyTriggerLogRequest, cb?: (error: string, rep: DescribeTaskPolicyTriggerLogResponse) => void): Promise<DescribeTaskPolicyTriggerLogResponse>;
}
