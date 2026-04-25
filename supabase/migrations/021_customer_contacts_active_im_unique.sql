-- 聯絡人：租戶內「在職」且 im_id 有值時防重；離職列 (employment_status=0) 不參與唯一性，以支援跳槽（舊列保留 + 新列掛新公司）。
-- 說明：若對 (tenant_id, im_id) 做「無條件」唯一，同一人在職列與離職列同時保留相同 im_id 會衝突，與「離職後新增一筆到新客戶」矛盾。
-- 企業主檔稅號：見 customer_master 之 customer_master_tenant_tax_id_lower_uniq（017）。

create unique index if not exists customer_contacts_tenant_im_id_active_uniq
  on public.customer_contacts (tenant_id, lower(btrim(im_id)))
  where employment_status = 1
    and im_id is not null
    and btrim(im_id) <> '';

comment on index public.customer_contacts_tenant_im_id_active_uniq is
  '在職聯絡人租戶內 im_id 不重複；離職 (0) 不納入，利跳槽保留歷史列並新增新客戶關聯';
