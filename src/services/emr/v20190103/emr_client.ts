/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * Copyright (c) 2018 THL A29 Limited, a Tencent company. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { AbstractClient } from "../../../common/abstract_client"
import { ClientConfig } from "../../../common/interface"
import {
  MultiDiskMC,
  EmrProductConfigOutter,
  LoginSettings,
  VPCSettings,
  PriceResource,
  ScaleOutInstanceResponse,
  InquiryPriceCreateInstanceRequest,
  Resource,
  TerminateInstanceRequest,
  PodVolume,
  TerminateInstanceResponse,
  CreateInstanceResponse,
  PodSpec,
  InquiryPriceRenewInstanceResponse,
  TerminateTasksRequest,
  InquiryPriceCreateInstanceResponse,
  HostVolumeContext,
  DescribeClusterNodesRequest,
  PreExecuteFileSettings,
  CreateInstanceRequest,
  DescribeInstancesResponse,
  InquiryPriceScaleOutInstanceRequest,
  Tag,
  Placement,
  DescribeInstancesRequest,
  CustomMetaInfo,
  InquiryPriceUpdateInstanceRequest,
  COSSettings,
  ClusterInstancesInfo,
  MultiDisk,
  SearchItem,
  InquiryPriceScaleOutInstanceResponse,
  OutterResource,
  UpdateInstanceSettings,
  TerminateTasksResponse,
  DescribeClusterNodesResponse,
  NodeHardwareInfo,
  InquiryPriceUpdateInstanceResponse,
  NewResourceSpec,
  PersistentVolumeContext,
  InquiryPriceRenewInstanceRequest,
  CdbInfo,
  ScaleOutInstanceRequest,
} from "./emr_models"

/**
 * emr client
 * @class
 */
export class Client extends AbstractClient {
  constructor(clientConfig: ClientConfig) {
    super("emr.tencentcloudapi.com", "2019-01-03", clientConfig)
  }

  /**
   * 缩容Task节点
   */
  async TerminateTasks(
    req: TerminateTasksRequest,
    cb?: (error: string, rep: TerminateTasksResponse) => void
  ): Promise<TerminateTasksResponse> {
    return this.request("TerminateTasks", req, cb)
  }

  /**
   * 查询EMR实例
   */
  async DescribeInstances(
    req: DescribeInstancesRequest,
    cb?: (error: string, rep: DescribeInstancesResponse) => void
  ): Promise<DescribeInstancesResponse> {
    return this.request("DescribeInstances", req, cb)
  }

  /**
   * 变配询价
   */
  async InquiryPriceUpdateInstance(
    req: InquiryPriceUpdateInstanceRequest,
    cb?: (error: string, rep: InquiryPriceUpdateInstanceResponse) => void
  ): Promise<InquiryPriceUpdateInstanceResponse> {
    return this.request("InquiryPriceUpdateInstance", req, cb)
  }

  /**
   * 查询硬件节点信息
   */
  async DescribeClusterNodes(
    req: DescribeClusterNodesRequest,
    cb?: (error: string, rep: DescribeClusterNodesResponse) => void
  ): Promise<DescribeClusterNodesResponse> {
    return this.request("DescribeClusterNodes", req, cb)
  }

  /**
   * 续费询价。
   */
  async InquiryPriceRenewInstance(
    req: InquiryPriceRenewInstanceRequest,
    cb?: (error: string, rep: InquiryPriceRenewInstanceResponse) => void
  ): Promise<InquiryPriceRenewInstanceResponse> {
    return this.request("InquiryPriceRenewInstance", req, cb)
  }

  /**
   * 创建EMR实例
   */
  async CreateInstance(
    req: CreateInstanceRequest,
    cb?: (error: string, rep: CreateInstanceResponse) => void
  ): Promise<CreateInstanceResponse> {
    return this.request("CreateInstance", req, cb)
  }

  /**
   * 创建实例询价
   */
  async InquiryPriceCreateInstance(
    req: InquiryPriceCreateInstanceRequest,
    cb?: (error: string, rep: InquiryPriceCreateInstanceResponse) => void
  ): Promise<InquiryPriceCreateInstanceResponse> {
    return this.request("InquiryPriceCreateInstance", req, cb)
  }

  /**
   * 扩容询价. 当扩容时候，请通过该接口查询价格。
   */
  async InquiryPriceScaleOutInstance(
    req: InquiryPriceScaleOutInstanceRequest,
    cb?: (error: string, rep: InquiryPriceScaleOutInstanceResponse) => void
  ): Promise<InquiryPriceScaleOutInstanceResponse> {
    return this.request("InquiryPriceScaleOutInstance", req, cb)
  }

  /**
   * 实例扩容
   */
  async ScaleOutInstance(
    req: ScaleOutInstanceRequest,
    cb?: (error: string, rep: ScaleOutInstanceResponse) => void
  ): Promise<ScaleOutInstanceResponse> {
    return this.request("ScaleOutInstance", req, cb)
  }

  /**
   * 销毁EMR实例。此接口仅支持弹性MapReduce正式计费版本。
   */
  async TerminateInstance(
    req: TerminateInstanceRequest,
    cb?: (error: string, rep: TerminateInstanceResponse) => void
  ): Promise<TerminateInstanceResponse> {
    return this.request("TerminateInstance", req, cb)
  }
}